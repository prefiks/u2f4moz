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

#include <config.h>
#include "u2f-host.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#define REGISTER 0
#define AUTHENTICATE 1

int
main (int argc, char *argv[])
{
  int exit_code = EXIT_FAILURE;
  char challenge[BUFSIZ];
  size_t chal_len;
  char *response = NULL;
  u2fh_devs *devs = NULL;
  u2fh_cmdflags flags = 0;
  u2fh_rc rc;

  if (argv != 3)
    exit (EXIT_FAILURE);

  int action = strcmp(argv[1], "r") ? REGISTER : AUTHENTICATE;

  chal_len = fread (challenge, 1, sizeof (challenge), stdin);
  if (!feof (stdin) || ferror (stdin))
    {
      perror ("read");
      exit (EXIT_FAILURE);
    }

  rc = u2fh_global_init (0);
  if (rc != U2FH_OK)
    {
      fprintf (stderr, "error: u2fh_global_init (%d): %s\n", rc,
	       u2fh_strerror (rc));
      exit (EXIT_FAILURE);
    }

  rc = u2fh_devs_init (&devs);
  if (rc != U2FH_OK)
    {
      fprintf (stderr, "error: u2fh_devs_init (%d): %s\n", rc,
	       u2fh_strerror (rc));
      goto done;
    }

  rc = u2fh_devs_discover (devs, NULL);
  if (rc != U2FH_OK)
    {
      fprintf (stderr, "error: u2fh_devs_discover (%d): %s\n", rc,
	       u2fh_strerror (rc));
      goto done;
    }
  if (strncmp ("pam://", argv[2], 6) != 0
      && strncmp ("http://", argv[2], 7) != 0
      && strncmp ("https://", argv[2], 8) != 0)
    {
      fprintf (stderr, "error: origin must be pam, http or https\n");
      exit (EXIT_FAILURE);
    }

  if (action == REGISTER)
    {
      rc = u2fh_register (devs, challenge, argv[2],
                          &response,
                          U2FH_REQUEST_USER_PRESENCE);
    }
  else
    {
      rc = u2fh_authenticate (devs, challenge, argv[2],
                              &response, U2FH_REQUEST_USER_PRESENCE);
    }
  if (rc != U2FH_OK || response == NULL)
    {
      fprintf (stderr, "error (%d): %s\n", rc, u2fh_strerror (rc));
      goto done;
    }

  printf ("%s\n", response);

  exit_code = EXIT_SUCCESS;

done:
  u2fh_devs_done (devs);
  u2fh_global_done ();

  exit (exit_code);
}
