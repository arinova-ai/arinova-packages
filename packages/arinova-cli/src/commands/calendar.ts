import type { Command } from "commander";
import { parseJsonOption } from "../json-options.js";
import { registerResourceCommands } from "../resource-commands.js";

function numbers(value?: string): number[] | undefined {
  return value?.split(",").map((item) => Number(item.trim()));
}

export function registerCalendarCommands(program: Command): void {
  const calendar = registerResourceCommands(program, {
    name: "calendar",
    description: "Calendar commands",
    basePath: "/api/v1/calendars",
    list: {},
    create: {
      configure(command) {
        command.requiredOption("--name <name>").option("--color <color>");
      },
      body: (options) => ({ name: options.name, color: options.color }),
    },
    show: {
      identifier: { kind: "argument", syntax: "<calendar-id>" },
    },
  });

  registerResourceCommands(calendar, {
    name: "event",
    description: "Calendar event commands",
    basePath: "/api/v1/calendar/events",
    identifier: { kind: "argument", syntax: "<event-id>" },
    list: {
      configure(command) {
        command
          .requiredOption("--from <datetime>", "Inclusive ISO datetime")
          .requiredOption("--to <datetime>", "Exclusive ISO datetime")
          .option("--expand");
      },
      query: (options) => ({
        from: options.from,
        to: options.to,
        expand: options.expand,
      }),
    },
    create: {
      configure(command) {
        command
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
          .option("--reminders <minutes>", "Comma-separated reminder minutes");
      },
      body: (options) => ({
        title: options.title,
        timezone: options.timezone,
        calendarId: options.calendarId,
        description: options.description,
        startAt: options.startAt,
        endAt: options.endAt,
        date: options.date,
        allDay: options.allDay,
        color: options.color,
        location: options.location,
        conversationId: options.conversationId,
        rrule: options.rrule,
        metadata: parseJsonOption(options.metadata, "--metadata"),
        reminders: numbers(options.reminders),
      }),
    },
    show: {},
    update: {
      configure(command) {
        command
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
          .option("--reminders <minutes>");
      },
      validate(options) {
        if (options.allDay && !["true", "false"].includes(options.allDay)) {
          throw new Error("--all-day must be true or false");
        }
      },
      body: (options) => ({
        title: options.title,
        description: options.description,
        startAt: options.startAt,
        endAt: options.endAt,
        date: options.date,
        timezone: options.timezone,
        color: options.color,
        location: options.location,
        conversationId: options.conversationId,
        rrule: options.rrule,
        updateScope: options.updateScope,
        allDay: options.allDay == null ? undefined : options.allDay === "true",
        metadata: parseJsonOption(options.metadata, "--metadata"),
        reminders: numbers(options.reminders),
      }),
    },
    delete: {
      configure(command) {
        command.option("--delete-scope <scope>");
      },
      query: (options) => ({ deleteScope: options.deleteScope }),
    },
  });
}
