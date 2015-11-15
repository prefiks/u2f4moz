/*
  Copyright (C) 2013-2015 Yubico AB

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

#include "u2f-host.h"

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#ifdef _WIN32
#include <windows.h>
#else

#include <signal.h>
#include <poll.h>

#endif

#define TIMEOUT 60

typedef struct {
  int op;
  char *domain;
  char **challenges;
} OP;

static OP eof_op = {'e'};

static int
read_n_bytes(char *buf, size_t len) {
  while (len > 0) {
    long r = read(0, buf, len);
    if (!r)
      return 0;
    buf += r;
    len -= r;
  }
  return 1;
}

#define READ_LEN(buf, val) do {long read_len = strtol(buf, NULL, 16); if (read_len <= 0) return &eof_op; val = read_len;} while(0)

static OP *
read_action(int timeout) {
#ifdef _WIN32
  HANDLE hIn = GetStdHandle(STD_INPUT_HANDLE);
  DWORD available;

  PeekNamedPipe(hIn, NULL, 0, NULL, &available, NULL);
  if (available == 0)
    return NULL;
#else
  struct pollfd pfd[] = {{0, POLLIN, 0}};
  poll(pfd, 1, timeout);
  if ((pfd[0].revents & (POLLIN | POLLERR | POLLHUP)) == 0)
    return NULL;
#endif
  char op;

  if (read(0, &op, 1) == 0)
    return &eof_op;

  if (op == 'r' || op == 's') {
    char input_buf[9];
    size_t challenges_lengths[16];
    size_t challenges_num, challenges_buf_len = 0, domain_len;
    int i;

    if (!read_n_bytes(input_buf, 8))
      return &eof_op;

    input_buf[8] = '\0';
    READ_LEN(input_buf + 4, challenges_num);
    input_buf[4] = '\0';
    READ_LEN(input_buf, domain_len);

    if (challenges_num >= sizeof(challenges_lengths)/sizeof(challenges_lengths[0]))
      return &eof_op;

    for (i = 0; i < challenges_num; i++) {
      if (!read_n_bytes(input_buf, 4))
        return &eof_op;
      READ_LEN(input_buf, challenges_lengths[i]);
      challenges_buf_len += challenges_lengths[i];
    }

    OP *buf = malloc(domain_len + (sizeof(char *) * (challenges_num + 1)) +
                     challenges_buf_len + challenges_num + 1 + sizeof(OP));
    if (!buf)
      return &eof_op;

    buf->op = op;
    buf->challenges = (char **) (buf + 1);
    buf->domain = (char *) (buf->challenges + challenges_num + 1);
    buf->domain[domain_len] = '\0';

    if (!read_n_bytes(buf->domain, domain_len)) {
      free(buf);
      return &eof_op;
    }

    char *challenge = buf->domain + domain_len + 1;
    for (i = 0; i < challenges_num; i++) {
      buf->challenges[i] = challenge;
      if (!read_n_bytes(buf->challenges[i], challenges_lengths[i])) {
        free(buf);
        return &eof_op;
      }
      challenge[challenges_lengths[i]] = '\0';
      challenge += challenges_lengths[i];
    }
    buf->challenges[challenges_num] = NULL;
    return buf;
  } else
    return &eof_op;
}

static void
report_error(u2fh_rc rc, char *label) {
  char buf[1024];
  int code = rc == U2FH_AUTHENTICATOR_ERROR ? 4 :
             rc == U2FH_MEMORY_ERROR || rc == U2FH_TRANSPORT_ERROR ? 1 :
             rc == U2FH_TIMEOUT_ERROR ? 5 : 2;

  if (label)
    sprintf(buf, "{\"errorCode\": %d, \"errorMessage\":\"%s:%s\"}",
            code, label, u2fh_strerror(rc));
  else
    sprintf(buf, "{\"errorCode\": %d}", code);

  printf("e%04lx%s", strlen(buf), buf);

  fflush(stdout);
}

#ifdef _WIN32
static HANDLE timer_handle = NULL;

static VOID CALLBACK
WaitOrTimerCallback(PVOID param, BOOLEAN timerFired) {
  exit(14);
}

static void
reset_quit_timer() {
  if (timer_handle)
    DeleteTimerQueueTimer(NULL, timer_handle, NULL);

  CreateTimerQueueTimer(&timer_handle, NULL, &WaitOrTimerCallback,
                        NULL, TIMEOUT*1000, 0, 0);
}
#else

static void
reset_quit_timer() {
  signal(SIGALRM, exit);
  alarm(TIMEOUT);
}

#endif

int
main(int argc, char *argv[]) {
  int exit_code = EXIT_FAILURE;
  char *response = NULL;
  u2fh_devs *devs = NULL;
  u2fh_rc rc;
  OP *action = NULL;
  int dev_insert_send = 0;
  u2fh_rc device_disappeared_rc = U2FH_OK;
  char *device_disappeared_msg = NULL;

  reset_quit_timer();

  rc = u2fh_global_init(0);
  if (rc != U2FH_OK) {
    report_error(rc, "global_init");
    exit(1);
  }

  rc = u2fh_devs_init(&devs);
  if (rc != U2FH_OK) {
    report_error(rc, "devs_init");
    goto done;
  }

  while (1) {
    rc = u2fh_devs_discover(devs, NULL);
    if (device_disappeared_rc != U2FH_OK && rc != U2FH_NO_U2F_DEVICE) {
      report_error(device_disappeared_rc, device_disappeared_msg);

      free(response);
      free(action);
      action = NULL;
    }
    if (rc != U2FH_OK && rc != U2FH_NO_U2F_DEVICE) {
      report_error(rc, "devs_discover");
      goto done;
    }

    device_disappeared_rc = U2FH_OK;

    if (!action) {
      action = read_action(1000);
      if (action)
        reset_quit_timer();
    } else
      sleep(1);

    if (rc != U2FH_OK && !dev_insert_send) {
      printf("i");
      fflush(stdout);
      dev_insert_send = 1;
    }

    if (action && (rc == U2FH_OK || action->op == 'e')) {
      if (action->op == 'e')
        goto done;
      else if (action->op == 'r') {
        int i = 0;
        do {
          rc = u2fh_register(devs, action->challenges[i], action->domain,
                             &response,
                             U2FH_REQUEST_USER_PRESENCE);
          i++;
        } while (action->challenges[i] && rc == U2FH_AUTHENTICATOR_ERROR);

        if (rc != U2FH_OK) {
          device_disappeared_rc = rc;
          device_disappeared_msg = "register";
          continue;
        } else {
          printf("r%04lx%s", strlen(response), response);
          fflush(stdout);
        }

        free(response);
        free(action);
        action = NULL;
      } else if (action->op == 's') {
        int i = 0;
        do {
          rc = u2fh_authenticate(devs, action->challenges[i], action->domain,
                                 &response,
                                 U2FH_REQUEST_USER_PRESENCE);
          i++;
        } while (action->challenges[i] && rc == U2FH_AUTHENTICATOR_ERROR);

        if (rc != U2FH_OK) {
          device_disappeared_rc = rc;
          device_disappeared_msg = "authenticate";
          continue;
        } else {
          printf("r%04lx%s", strlen(response), response);
          fflush(stdout);
        }

        free(response);
        free(action);
        action = NULL;
      } else {
        report_error(U2FH_TRANSPORT_ERROR, NULL);
        goto done;
      }
    }
  }

  done:
  u2fh_devs_done(devs);
  u2fh_global_done();

  exit(exit_code);
}
