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
#include "internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#define REGISTER 0
#define AUTHENTICATE 1

static int
ping_device (u2fh_devs * devs, unsigned index)
{
  unsigned char data[1] = { 0 };
  unsigned char resp[1024];
  size_t resplen = sizeof (resp);
  return u2fh_sendrecv (devs, index, U2FHID_PING, data, sizeof (data), resp,
                        &resplen);
}

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

  rc = u2fh_global_init (1);
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

  int num_devices = 0;
  rc = u2fh_devs_discover (devs, &num_devices);
  if (rc != U2FH_OK)
    {
      fprintf (stderr, "error: u2fh_devs_discover (%d): %s\n", rc,
	       u2fh_strerror (rc));
      goto done;
    }

  for (int i = 0; i <= num_devices; i++) {
    fprintf (stderr, "pinging device %d = %d\n", i,
             ping_device(devs, i));
  }

  exit_code = EXIT_SUCCESS;

done:
  u2fh_devs_done (devs);
  u2fh_global_done ();

  exit (exit_code);
}
