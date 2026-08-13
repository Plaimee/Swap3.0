const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com")
      ? { rejectUnauthorized: false }
      : false,
});

const initDatabase = async () => {
  try {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS player_logs (
            id SERIAL PRIMARY KEY,
            player_id VARCHAR(255) NOT NULL,
            selected_art VARCHAR(255) NOT NULL,
            consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
            swap_mode VARCHAR(255) NOT NULL,
            result_image_url VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    await pool.query(createTableQuery);
    console.log(
      " Postgres database & table 'player_logs' initialized successfully.",
    );
  } catch (error) {
    console.error(" Failed to initialize Postgres database: ", error);
  }
};

const insertPlayerLog = async (data) => {
  const query = `
        INSERT INTO player_logs (player_id, selected_art, consent_accepted, swap_mode, result_image_url) VALUES ($1, $2, $3, $4, $5) RETURNING id
    `;

  const values = [
    data.playerId,
    data.selectedArt,
    Boolean(data.consentAccepted),
    data.swapMode,
    data.resultImageUrl || null,
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
};

const updateResultImageUrl = async (logId, resultImageUrl) => {
  const query = `UPDATE player_logs SET result_image_url = $1 WHERE id = $2`;

  const result = await pool.query(query, [resultImageUrl, logId]);
  return result;
};

const getAllLogs = async () => {
  const result = await pool.query(
    "SELECT * FROM player_logs ORDER BY created_at DESC",
  );
  return result.rows;
};

module.exports = {
  initDatabase,
  insertPlayerLog,
  updateResultImageUrl,
  getAllLogs,
};
