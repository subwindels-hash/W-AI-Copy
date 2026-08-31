/* Minimal libaio.so.1 for the MySQL 5.7 harness: the sandbox has no libaio
   package and no package mirror, and mysqld only needs three entry points.
   Each is a direct syscall wrapper, matching the real library's ABI. */
#define _GNU_SOURCE
#include <unistd.h>
#include <sys/syscall.h>
#include <sys/types.h>

typedef unsigned long io_context_t;
struct io_event_stub { unsigned long data; unsigned long obj; long res; long res2; };
struct iocb_stub;
struct timespec;

int io_setup(unsigned nr, io_context_t *ctxp) { return (int)syscall(206, nr, ctxp); }
int io_destroy(io_context_t ctx) { return (int)syscall(207, ctx); }
int io_submit(io_context_t ctx, long nr, struct iocb_stub **ios) { return (int)syscall(209, ctx, nr, ios); }
int io_cancel(io_context_t ctx, struct iocb_stub *iocb, struct io_event_stub *evt) { return (int)syscall(210, ctx, iocb, evt); }
int io_getevents(io_context_t ctx, long min_nr, long nr, struct io_event_stub *events, struct timespec *timeout) { return (int)syscall(208, ctx, min_nr, nr, events, timeout); }
