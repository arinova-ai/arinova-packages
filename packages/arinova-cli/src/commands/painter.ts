import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult } from "../output.js";
import { parseCount } from "../pagination.js";

export function registerPainterCommands(program: Command): void {
  const e = encodePathSegment;
  const painter = program.command("painter").description("Painter Hub — AI art style marketplace");

  // ── Creator commands ────────────────────────────────

  painter.command("list")
    .description("List my albums")
    .action(async () => {
      printResult(await resolveClient(painter).get("/api/painter/albums"));
    });

  painter.command("create")
    .description("Create a new album")
    .requiredOption("--name <name>", "Album name")
    .option("--description <text>", "Description")
    .option("--category <cat>", "Category (general/anime/portrait/landscape/abstract/pixel/watercolor/oil)")
    .option("--price-type <type>", "Price type (free/credits)")
    .option("--price-amount <n>", "Price amount in credits")
    .action(async (opts: { name: string; description?: string; category?: string; priceType?: string; priceAmount?: string }) => {
      const body: Record<string, unknown> = { name: opts.name };
      if (opts.description) body.description = opts.description;
      if (opts.category) body.category = opts.category;
      if (opts.priceType) body.priceType = opts.priceType;
      if (opts.priceAmount) body.priceAmount = parseInt(opts.priceAmount);
      printResult(await resolveClient(painter).post("/api/painter/albums", body));
    });

  painter.command("update")
    .description("Update an album")
    .requiredOption("--id <id>", "Album ID")
    .option("--name <name>", "New name")
    .option("--description <text>", "New description")
    .option("--category <cat>", "New category")
    .option("--price-type <type>", "Price type")
    .option("--price-amount <n>", "Price amount")
    .option("--public <bool>", "Public visibility (true/false)")
    .action(async (opts: { id: string; name?: string; description?: string; category?: string; priceType?: string; priceAmount?: string; public?: string }) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.category) body.category = opts.category;
      if (opts.priceType) body.priceType = opts.priceType;
      if (opts.priceAmount) body.priceAmount = parseInt(opts.priceAmount);
      if (opts.public != null) body.isPublic = opts.public === "true";
      printResult(await resolveClient(painter).patch(`/api/painter/albums/${e(opts.id)}`, body));
    });

  painter.command("delete")
    .description("Delete an album")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(painter).delete(`/api/painter/albums/${e(opts.id)}`));
    });

  painter.command("upload-image")
    .description("Upload an image to an album")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--file <path>", "Image file path")
    .option("--caption <text>", "Image caption")
    .action(async (opts: { id: string; file: string; caption?: string }) => {
      const form = new FormData();
      await appendFileToForm(form, "file", opts.file);
      if (opts.caption) form.append("caption", opts.caption);
      printResult(
        await resolveClient(painter).upload(
          `/api/painter/albums/${e(opts.id)}/images`,
          form,
        ),
      );
    });

  painter.command("set-prompt")
    .description("Set album system prompt")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--prompt <text>", "System prompt text")
    .action(async (opts: { id: string; prompt: string }) => {
      printResult(await resolveClient(painter).patch(
        `/api/painter/albums/${e(opts.id)}`,
        { systemPrompt: opts.prompt },
      ));
    });

  painter.command("set-webhook")
    .description("Set album webhook URL")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--url <url>", "Webhook URL")
    .action(async (opts: { id: string; url: string }) => {
      printResult(await resolveClient(painter).patch(
        `/api/painter/albums/${e(opts.id)}`,
        { webhookUrl: opts.url },
      ));
    });

  painter.command("stats")
    .description("View album statistics")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      const data = await resolveClient(painter).get(
        `/api/painter/albums/${e(opts.id)}`,
      ) as Record<string, unknown>;
      printResult({
        name: data.name,
        generationCount: data.generationCount,
        ratingAvg: data.ratingAvg,
        imageCount: Array.isArray(data.images) ? data.images.length : 0,
        isPublic: data.isPublic,
        priceType: data.priceType,
        category: data.category,
      });
    });

  // ── User commands ──────────────────────────────────

  painter.command("explore")
    .description("Browse public albums")
    .option("--search <query>", "Search albums")
    .option("--category <cat>", "Filter by category")
    .option("--sort <sort>", "Sort: newest/popular/rating")
    .option("--page <n>", "Page number", parseCount)
    .action(async (opts: { search?: string; category?: string; sort?: string; page?: number }) => {
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      if (opts.category) params.set("category", opts.category);
      if (opts.sort) params.set("sort", opts.sort);
      if (opts.page !== undefined) params.set("page", String(opts.page));
      params.set("pageSize", "12");
      printResult(await resolveClient(painter).get(`/api/painter/explore?${params}`));
    });

  painter.command("show")
    .description("View album details")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(painter).get(`/api/painter/albums/${e(opts.id)}`));
    });

  painter.command("generate")
    .description("Generate an image from an album")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--prompt <text>", "Generation prompt")
    .action(async (opts: { id: string; prompt: string }) => {
      printResult(await resolveClient(painter).post(
        `/api/painter/albums/${e(opts.id)}/generate`,
        { prompt: opts.prompt },
      ));
    });

  painter.command("my-generations")
    .description("View my generation history")
    .option("--page <n>", "Page number", parseCount)
    .action(async (opts: { page?: number }) => {
      const params = new URLSearchParams({ pageSize: "20" });
      if (opts.page !== undefined) params.set("page", String(opts.page));
      printResult(await resolveClient(painter).get(`/api/painter/my-generations?${params}`));
    });
}
