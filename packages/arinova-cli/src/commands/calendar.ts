import type { Command } from "commander";
import { buildQuery, del, encodePathSegment, get, patch, post } from "../client.js";
import { printResult } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { parseCount } from "../pagination.js";

const e = encodePathSegment;

function numbers(value?: string): number[] | undefined {
  return value?.split(",").map((item) => Number(item.trim()));
}

export function registerCalendarCommands(program: Command): void {
  const calendar = program.command("calendar").description("Calendar commands");
  calendar.command("list").action(async () => printResult(await get("/api/v1/calendars")));
  calendar.command("create")
    .requiredOption("--name <name>")
    .option("--color <color>")
    .action(async (opts) => printResult(await post("/api/v1/calendars", {
      name: opts.name, color: opts.color,
    })));
  calendar.command("show").argument("<calendar-id>").action(async (id: string) => {
    printResult(await get(`/api/v1/calendars/${e(id)}`));
  });

  const event = calendar.command("event").description("Calendar event commands");
  event.command("list")
    .requiredOption("--from <datetime>", "Inclusive ISO datetime")
    .requiredOption("--to <datetime>", "Exclusive ISO datetime")
    .option("--limit <n>", "Maximum results", parseCount)
    .option("--offset <n>", "Results to skip", parseCount)
    .option("--expand")
    .action(async (opts) => {
      printResult(await get(`/api/v1/calendar/events${buildQuery(opts)}`));
    });
  event.command("create")
    .requiredOption("--title <title>")
    .requiredOption("--timezone <timezone>")
    .option("--calendar-id <id>")
    .option("--description <text>")
    .option("--start-at <datetime>")
    .option("--end-at <datetime>")
    .option("--date <date>")
    .option("--all-day")
    .option("--color <color>")
    .option("--location <location>")
    .option("--conversation-id <id>")
    .option("--metadata <json>")
    .option("--rrule <rule>")
    .option("--reminders <minutes>", "Comma-separated reminder minutes")
    .action(async (opts) => {
      printResult(await post("/api/v1/calendar/events", {
        title: opts.title,
        timezone: opts.timezone,
        calendarId: opts.calendarId,
        description: opts.description,
        startAt: opts.startAt,
        endAt: opts.endAt,
        date: opts.date,
        allDay: opts.allDay,
        color: opts.color,
        location: opts.location,
        conversationId: opts.conversationId,
        rrule: opts.rrule,
        metadata: parseJsonOption(opts.metadata, "--metadata"),
        reminders: numbers(opts.reminders),
      }));
    });
  event.command("show").argument("<event-id>").action(async (id: string) => {
    printResult(await get(`/api/v1/calendar/events/${e(id)}`));
  });
  event.command("update")
    .argument("<event-id>")
    .option("--title <title>")
    .option("--description <text>")
    .option("--start-at <datetime>")
    .option("--end-at <datetime>")
    .option("--date <date>")
    .option("--all-day <boolean>")
    .option("--timezone <timezone>")
    .option("--color <color>")
    .option("--location <location>")
    .option("--conversation-id <id>")
    .option("--metadata <json>")
    .option("--rrule <rule>")
    .option("--update-scope <scope>")
    .option("--reminders <minutes>")
    .action(async (id: string, opts) => {
      if (opts.allDay && !["true", "false"].includes(opts.allDay)) {
        throw new Error("--all-day must be true or false");
      }
      printResult(await patch(`/api/v1/calendar/events/${e(id)}`, {
        title: opts.title,
        description: opts.description,
        startAt: opts.startAt,
        endAt: opts.endAt,
        date: opts.date,
        timezone: opts.timezone,
        color: opts.color,
        location: opts.location,
        conversationId: opts.conversationId,
        rrule: opts.rrule,
        updateScope: opts.updateScope,
        allDay: opts.allDay == null ? undefined : opts.allDay === "true",
        metadata: parseJsonOption(opts.metadata, "--metadata"),
        reminders: numbers(opts.reminders),
      }));
    });
  event.command("delete")
    .argument("<event-id>")
    .option("--delete-scope <scope>")
    .action(async (id: string, opts) => {
      printResult(await del(`/api/v1/calendar/events/${e(id)}${buildQuery({
        deleteScope: opts.deleteScope,
      })}`));
    });
}
