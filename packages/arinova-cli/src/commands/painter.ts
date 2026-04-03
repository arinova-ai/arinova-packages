import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerPainterCommands(program: Command): void {
  const painter = program.command("painter").description("Painter Hub — AI art style marketplace");

  // ── Creator commands ────────────────────────────────

  painter.command("list")
    .description("List my albums")
    .action(async () => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/painter/albums`, token }));
    });

  painter.command("create")
    .description("Create a new album")
    .requiredOption("--name <name>", "Album name")
    .option("--description <text>", "Description")
    .option("--category <cat>", "Category (general/anime/portrait/landscape/abstract/pixel/watercolor/oil)")
    .option("--price-type <type>", "Price type (free/credits)")
    .option("--price-amount <n>", "Price amount in credits")
    .action(async (opts: { name: string; description?: string; category?: string; priceType?: string; priceAmount?: string }) => {
      const { token, apiUrl } = getOpts(painter);
      const body: Record<string, unknown> = { name: opts.name };
      if (opts.description) body.description = opts.description;
      if (opts.category) body.category = opts.category;
      if (opts.priceType) body.priceType = opts.priceType;
      if (opts.priceAmount) body.priceAmount = parseInt(opts.priceAmount);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/painter/albums`, token, body }));
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
      const { token, apiUrl } = getOpts(painter);
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.category) body.category = opts.category;
      if (opts.priceType) body.priceType = opts.priceType;
      if (opts.priceAmount) body.priceAmount = parseInt(opts.priceAmount);
      if (opts.public != null) body.isPublic = opts.public === "true";
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/painter/albums/${opts.id}`, token, body }));
    });

  painter.command("delete")
    .description("Delete an album")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/painter/albums/${opts.id}`, token }));
    });

  painter.command("upload-image")
    .description("Upload an image to an album")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--file <path>", "Image file path")
    .option("--caption <text>", "Image caption")
    .action(async (opts: { id: string; file: string; caption?: string }) => {
      const { token, apiUrl } = getOpts(painter);
      const fileData = readFileSync(opts.file);
      const blob = new Blob([fileData]);
      const form = new FormData();
      form.append("file", blob, basename(opts.file));
      if (opts.caption) form.append("caption", opts.caption);
      const res = await fetch(`${apiUrl}/api/painter/albums/${opts.id}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) { console.error(`Error ${res.status}: ${text.slice(0, 500)}`); process.exit(1); }
      try { output(JSON.parse(text)); } catch { console.log(text); }
    });

  painter.command("set-prompt")
    .description("Set album system prompt")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--prompt <text>", "System prompt text")
    .action(async (opts: { id: string; prompt: string }) => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/painter/albums/${opts.id}`, token, body: { systemPrompt: opts.prompt } }));
    });

  painter.command("set-webhook")
    .description("Set album webhook URL")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--url <url>", "Webhook URL")
    .action(async (opts: { id: string; url: string }) => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/painter/albums/${opts.id}`, token, body: { webhookUrl: opts.url } }));
    });

  painter.command("stats")
    .description("View album statistics")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(painter);
      const data = await apiCall({ method: "GET", url: `${apiUrl}/api/painter/albums/${opts.id}`, token }) as Record<string, unknown>;
      output({
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
    .option("--page <n>", "Page number")
    .action(async (opts: { search?: string; category?: string; sort?: string; page?: string }) => {
      const { token, apiUrl } = getOpts(painter);
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      if (opts.category) params.set("category", opts.category);
      if (opts.sort) params.set("sort", opts.sort);
      if (opts.page) params.set("page", opts.page);
      params.set("pageSize", "12");
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/painter/explore?${params}`, token }));
    });

  painter.command("show")
    .description("View album details")
    .requiredOption("--id <id>", "Album ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/painter/albums/${opts.id}`, token }));
    });

  painter.command("generate")
    .description("Generate an image from an album")
    .requiredOption("--id <id>", "Album ID")
    .requiredOption("--prompt <text>", "Generation prompt")
    .action(async (opts: { id: string; prompt: string }) => {
      const { token, apiUrl } = getOpts(painter);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/painter/albums/${opts.id}/generate`, token, body: { prompt: opts.prompt } }));
    });

  painter.command("my-generations")
    .description("View my generation history")
    .option("--page <n>", "Page number")
    .action(async (opts: { page?: string }) => {
      const { token, apiUrl } = getOpts(painter);
      const params = new URLSearchParams({ pageSize: "20" });
      if (opts.page) params.set("page", opts.page);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/painter/my-generations?${params}`, token }));
    });
}
