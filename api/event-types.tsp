import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallCalendar;

model NewEventType {
  @minLength(1)
  title: string;
  @minLength(1)
  description: string;
  @minValue(1)
  @maxValue(540)
  durationMinutes: int32;
}

model EventType {
  id: string;
  ...NewEventType;
}

@get
@route("/api/event-types")
@operationId("listEventTypes")
op listEventTypes(): EventType[];

model EventTypeCreated {
  @statusCode statusCode: 201;
  @body eventType: EventType;
}

@post
@route("/api/event-types")
@operationId("createEventType")
op createEventType(@body eventType: NewEventType): EventTypeCreated | BadRequestResponse;

@error
model EventTypeNotFound {
  @statusCode statusCode: 404;
  @body body: { message: string };
}
