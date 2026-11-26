import "@typespec/http";
import "@typespec/openapi";
import "./event-types.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace CallCalendar;

model Slot {
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  available: boolean;
}

model SlotWindow {
  eventType: EventType;
  @doc("All 14 calendar dates in Europe/Moscow, including weekends.")
  days: plainDate[];
  slots: Slot[];
}

@get
@route("/api/event-types/{id}/slots")
@operationId("listSlots")
op listSlots(@path id: string): SlotWindow | EventTypeNotFound;
