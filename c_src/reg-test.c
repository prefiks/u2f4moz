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

//#include <config.h>
#include "u2f-host.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <limits.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <signal.h>
#include <poll.h>
#endif

#define TIMEOUT 60

typedef struct{
  int op;
  char *domain;
  char *challenge;
} OP;

OP eof_op = {'e'};

int
read_n_bytes(char *buf, int len) {
  while (len > 0) {
    int r = read(0, buf, len);
    if (!r)
      return 0;
    buf += r;
    len -= r;
  }
  return 1;
}

static int did_send = 0;

OP *
read_action(int timeout) {
  if (did_send)
    return &eof_op;

  char *domain = "http://test.com";
  char *challenge = "{\"challenge\":\"zLA9a6ifD28iWXgM9ka1MIf55OGHPP-PD8jdvCPKQVw\",\"version\":\"U2F_V2\",\"appId\":\"http://test.com\"}";
  int dol = strlen(domain);
  int chl = strlen(challenge);
  OP *buf = malloc(sizeof(OP)+dol+chl+2);
  buf->op = 'r';
  buf->domain = ((char*)buf)+sizeof(OP);
  buf->challenge = ((char*)buf)+sizeof(OP)+dol+1;
  memcpy(buf->domain, domain, dol+1);
  memcpy(buf->challenge, challenge, chl+1);
  did_send = 1;

  return buf;
}

void
report_error(u2fh_rc rc, char *label)
{
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
static VOID CALLBACK WaitOrTimerCallback(PVOID param, BOOLEAN timerFired) {
  exit(14);
}
#endif

int
main (int argc, char *argv[])
{
  int exit_code = EXIT_FAILURE;
  char *response = NULL;
  u2fh_devs *devs = NULL;
  u2fh_cmdflags flags = 0;
  u2fh_rc rc;
  OP *action = NULL;
  int dev_insert_send = 0;

#ifdef _WIN32
  char path[MAX_PATH+1];
  char *last;
  GetFullPathName(argv[0], MAX_PATH, path, &last);
  strcpy(last, "log-stdout.txt");
  freopen(path, "w", stdout);
  strcpy(last, "log-stderr.txt");
  freopen(path, "w", stderr);
#endif

  rc = u2fh_global_init (1);
  if (rc != U2FH_OK) {
    report_error(rc, "global_init");
    exit(1);
  }

  rc = u2fh_devs_init (&devs);
  if (rc != U2FH_OK){
    report_error(rc, "devs_init");
    goto done;
  }

  while (1) {
    rc = u2fh_devs_discover (devs, NULL);
    if (rc != U2FH_OK && rc != U2FH_NO_U2F_DEVICE) {
      report_error(rc, "devs_discover");
      goto done;
    }
    if (!action)
      action = read_action(1000);
    else
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
        rc = u2fh_register(devs, action->challenge, action->domain,
                           &response,
                           U2FH_REQUEST_USER_PRESENCE);
        if (rc != U2FH_OK)
          report_error(rc, "register");
        else {
          printf("r%04lx%s", strlen(response), response);
          fflush(stdout);
        }

        free(response);
        free(action);
        action = NULL;
      } else if (action->op == 's') {
        rc = u2fh_authenticate(devs, action->challenge, action->domain,
                               &response,
                               U2FH_REQUEST_USER_PRESENCE);
        if (rc != U2FH_OK)
          report_error(rc, "authenticate");
        else {
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
  u2fh_devs_done (devs);
  u2fh_global_done ();

  exit (exit_code);
}
