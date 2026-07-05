import cors from "cors";
import express from "express";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(__dirname, "..");
const databaseUrl = process.env.DATABASE_URL;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

function requireDatabase(response) {
  if (pool) return true;
  response.status(503).json({ error: "DATABASE_URL is not configured" });
  return false;
}

app.use(express.json({ limit: "12mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    }
  })
);
app.use(express.static(siteRoot, { extensions: ["html"], index: "index.html" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, database: Boolean(pool) });
});

// Middleware de sécurité : vérifie la clé secrète pour les écritures
function requireAdmin(request, response, next) {
  const clientSecret = request.headers["x-admin-secret"];
  const serverSecret = process.env.ADMIN_SECRET;

  // Si aucune clé n'est configurée sur le serveur ou si elle ne correspond pas
  if (!serverSecret || clientSecret !== serverSecret) {
    response.status(401).json({ error: "Accès non autorisé : Clé secrète invalide ou manquante." });
    return; // On arrête tout, la requête n'ira pas jusqu'à la base de données
  }
  
  next(); // La clé est bonne, on autorise le passage vers la base de données !
}

app.get("/api/articles", async (_request, response, next) => {
  if (!requireDatabase(response)) return;
  try {
    const result = await pool.query(`
      select
        a.id,
        a.slug,
        a.title,
        a.category,
        a.created_at as "createdAt",
        a.updated_at as "updatedAt",
        coalesce(
          json_agg(
            json_build_object(
              'timestamp', r.created_at,
              'note', r.note,
              'html', r.html
            )
            order by r.created_at asc
          ) filter (where r.id is not null),
          '[]'
        ) as versions
      from articles a
      left join article_revisions r on r.article_id = a.id
      group by a.id
      order by a.updated_at desc
    `);
    response.json({ articles: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/articles", requireAdmin, async (request, response, next) => {
  if (!requireDatabase(response)) return;
  const article = request.body;
  const firstVersion = article.versions?.[0];
  if (!article.slug || !article.title || !firstVersion?.html) {
    response.status(400).json({ error: "Invalid article payload" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const inserted = await client.query(
      `
        insert into articles (slug, title, category, created_at, updated_at)
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [article.slug, article.title, article.category || "", article.createdAt, article.updatedAt]
    );
    await client.query(
      `
        insert into article_revisions (article_id, note, html, created_at)
        values ($1, $2, $3, $4)
      `,
      [inserted.rows[0].id, firstVersion.note || "", firstVersion.html, firstVersion.timestamp]
    );
    await client.query("commit");
    response.status(201).json({ ok: true });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/articles/:slug/revisions", requireAdmin, async (request, response, next) => {
  if (!requireDatabase(response)) return;
  const { slug } = request.params;
  const { title, category, updatedAt, version } = request.body;
  if (!version?.html || !version.timestamp) {
    response.status(400).json({ error: "Invalid revision payload" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const article = await client.query(
      `
        update articles
        set title = $1, category = $2, updated_at = $3
        where slug = $4
        returning id
      `,
      [title, category || "", updatedAt, slug]
    );
    if (article.rowCount === 0) {
      response.status(404).json({ error: "Article not found" });
      await client.query("rollback");
      return;
    }
    await client.query(
      `
        insert into article_revisions (article_id, note, html, created_at)
        values ($1, $2, $3, $4)
      `,
      [article.rows[0].id, version.note || "", version.html, version.timestamp]
    );
    await client.query("commit");
    response.json({ ok: true });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

app.get("*", (_request, response) => {
  response.sendFile(path.join(siteRoot, "index.html"));
});

async function initializeDatabase() {
  if (!pool) return;
  const schema = await fs.readFile(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
}

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Noita Codex API listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed", error);
    process.exitCode = 1;
  });
