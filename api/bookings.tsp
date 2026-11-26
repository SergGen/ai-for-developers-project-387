import "@typespec/http";
import "@typespec/openapi";
import "./event-types.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallCalendar;

model NewBooking {
  eventTypeId: string;
  startsAt: offsetDateTime;
  @minLength(1)
  guestName: string;
  @doc("Optional topic of this particular booking.")
  topic?: string;
}

model ConfirmedBooking {
  eventType: EventType;
  guestName: string;
  topic?: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

model BookingCreated {
  @statusCode statusCode: 201;
  @body booking: ConfirmedBooking;
}

@error
model InvalidBooking {
  @statusCode statusCode: 400;
  @body body: { message: string };
}

@error
model SlotConflict {
  @statusCode statusCode: 409;
  @body body: { message: string };
}

@post
@route("/api/bookings")
@operationId("createBooking")
op createBooking(@body booking: NewBooking): BookingCreated | InvalidBooking | EventTypeNotFound | SlotConflict;

@get
@route("/api/bookings/upcoming")
@operationId("listUpcomingBookings")
op listUpcomingBookings(): ConfirmedBooking[];
