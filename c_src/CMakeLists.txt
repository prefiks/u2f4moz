CMAKE_MINIMUM_REQUIRED(VERSION 3.3)

INCLUDE (CheckIncludeFiles)
INCLUDE (CheckSymbolExists)
INCLUDE (CheckFunctionExists)

IF(APPLE)
  SET(hidapi_SRC hidapi/hid-mac.c)
  LIST(APPEND extra_LIBS "-framework IOKit" "-framework CoreFoundation")
  SET(TARGET_LOCATION darwin_${CMAKE_SYSTEM_PROCESSOR}-gcc3)
ELSEIF(WIN32)
  SET(hidapi_SRC hidapi/hid-win.c)
  SET(TARGET_LOCATION winnt_${CMAKE_SYSTEM_PROCESSOR}-msvc)
ELSEIF(UNIX)
  SET(extra_LIBS  pthread)
  SET(extra_INCLUDES)
  IF(USE_LIBUSB)
    FIND_PACKAGE(PkgConfig)
    PKG_CHECK_MODULES(libusb REQUIRED libusb-1.0)
    LIST(APPEND extra_LIBS ${libusb_LIBRARIES})
    LIST(APPEND extra_INCLUDES ${libusb_INCLUDE_DIRS})
    SET(hidapi_SRC hidapi/hid-linux-libusb.c)
  ELSE()
    FIND_PACKAGE(PkgConfig)
    PKG_CHECK_MODULES(libudev REQUIRED libudev)
    LIST(APPEND extra_LIBS ${libudev_LIBRARIES})
    LIST(APPEND extra_INCLUDES ${libudev_INCLUDE_DIRS})
    SET(hidapi_SRC hidapi/hid-linux-hidraw.c)
  ENDIF(USE_LIBUSB)
  SET(TARGET_LOCATION linux_${CMAKE_SYSTEM_PROCESSOR}-gcc3)
ENDIF(APPLE)

INCLUDE_DIRECTORIES(${extra_INCLUDES} json-c libu2f-host hidapi ${CMAKE_CURRENT_BINARY_DIR})

CHECK_INCLUDE_FILES(fcntl.h STDC_HEADERS)
CHECK_INCLUDE_FILES(fcntl.h HAVE_FCNTL_H)
CHECK_INCLUDE_FILES(limits.h HAVE_LIMITS_H)
CHECK_INCLUDE_FILES(strings.h HAVE_STRINGS_H)
CHECK_INCLUDE_FILES(syslog.h HAVE_SYSLOG_H)
CHECK_INCLUDE_FILES(unistd.h HAVE_UNISTD_H)
CHECK_INCLUDE_FILES(sys/cdefs.h HAVE_SYS_CDEFS_H)
CHECK_INCLUDE_FILES(sys/param.h HAVE_SYS_PARAM_H)
CHECK_INCLUDE_FILES(stdarg.h HAVE_STDARG_H)
CHECK_INCLUDE_FILES(locale.h HAVE_LOCALE_H)
CHECK_INCLUDE_FILES(endian.h HAVE_ENDIAN_H)
CHECK_INCLUDE_FILES(inttypes.h JSON_C_HAVE_INTTYPES_H)

CHECK_FUNCTION_EXISTS(vprintf HAVE_VPRINTF)
CHECK_FUNCTION_EXISTS(_doprnt HAVE_DOPRNT)
CHECK_FUNCTION_EXISTS(memcpm HAVE_MEMCMP)
CHECK_FUNCTION_EXISTS(realloc HAVE_REALLOC)
CHECK_FUNCTION_EXISTS(strcasecmp HAVE_STRCASECMP)
CHECK_FUNCTION_EXISTS(strdup HAVE_STRDUP)
CHECK_FUNCTION_EXISTS(strerror HAVE_STRERROR)
CHECK_FUNCTION_EXISTS(snprintf HAVE_SNPRINTF)
CHECK_FUNCTION_EXISTS(vsnprintf HAVE_VSNPRINTF)
CHECK_FUNCTION_EXISTS(vasprintf HAVE_VASPRINTF)
CHECK_FUNCTION_EXISTS(open HAVE_OPEN)
CHECK_FUNCTION_EXISTS(vsyslog HAVE_VSYSLOG)
CHECK_FUNCTION_EXISTS(strncasecmp HAVE_STRNCASECMP)
CHECK_FUNCTION_EXISTS(setlocale HAVE_SETLOCALE)

CHECK_SYMBOL_EXISTS(INFINITY math.h HAVE_DECL_INFINITY)
CHECK_SYMBOL_EXISTS(NAN math.h HAVE_DECL_NAN)
CHECK_SYMBOL_EXISTS(isnan math.h HAVE_DECL_ISNAN)
CHECK_SYMBOL_EXISTS(isinf math.h HAVE_DECL_ISINF)
CHECK_SYMBOL_EXISTS(_isinf math.h HAVE_DECL__ISINF)
CHECK_SYMBOL_EXISTS(_finite math.h HAVE_DECL__FINITE)

CONFIGURE_FILE(${CMAKE_CURRENT_SOURCE_DIR}/json-c/config.h.in ${CMAKE_CURRENT_BINARY_DIR}/config.h)
CONFIGURE_FILE(${CMAKE_CURRENT_SOURCE_DIR}/json-c/json_config.h.in ${CMAKE_CURRENT_BINARY_DIR}/json_config.h)

ADD_LIBRARY(hidapi OBJECT ${hidapi_SRC})

ADD_LIBRARY(jsonc OBJECT json-c/arraylist.c
  json-c/debug.c
  json-c/json_c_version.c
  json-c/json_object.c
  json-c/json_object_iterator.c
  json-c/json_tokener.c
  json-c/json_util.c
  json-c/libjson.c
  json-c/linkhash.c
  json-c/printbuf.c
  json-c/random_seed.c)

ADD_LIBRARY(u2fhost OBJECT
  libu2f-host/authenticate.c
  libu2f-host/cdecode.c
  libu2f-host/cencode.c
  libu2f-host/devs.c
  libu2f-host/error.c
  libu2f-host/global.c
  libu2f-host/register.c
  libu2f-host/u2f-host.c
  libu2f-host/u2fmisc.c
  libu2f-host/sha256.c)

ADD_EXECUTABLE(u2f
  $<TARGET_OBJECTS:u2fhost>
  $<TARGET_OBJECTS:hidapi>
  $<TARGET_OBJECTS:jsonc>)

TARGET_LINK_LIBRARIES(u2f ${extra_LIBS})

INSTALL(TARGETS u2f DESTINATION ${PROJECT_SOURCE_DIR}/../ext/bin/${TARGET_LOCATION})
