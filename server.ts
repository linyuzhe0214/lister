import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('reports.db');

// Create the reports table
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_number TEXT,
    log_time TEXT,
    highway TEXT,
    direction TEXT,
    lane TEXT,
    damage_condition TEXT,
    improvement_method TEXT,
    supervision_review TEXT,
    follow_up_method TEXT,
    completion_time TEXT,
    location_type TEXT,
    photo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec('ALTER TABLE reports ADD COLUMN mileage TEXT');
} catch (e) {
  // Column already exists
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get('/api/reports', (req, res) => {
    try {
      const { location_type } = req.query;
      let query = 'SELECT * FROM reports ORDER BY created_at ASC';
      let params: any[] = [];
      
      if (location_type && location_type !== 'all') {
        query = 'SELECT * FROM reports WHERE location_type = ? ORDER BY created_at ASC';
        params = [location_type];
      }

      const stmt = db.prepare(query);
      const reports = stmt.all(...params);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/reports', (req, res) => {
    try {
      const data = req.body;
      const stmt = db.prepare(`
        INSERT INTO reports (
          item_number, log_time, highway, direction, mileage, lane, 
          damage_condition, improvement_method, supervision_review, 
          follow_up_method, completion_time, location_type, photo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        data.item_number,
        data.log_time,
        data.highway,
        data.direction,
        data.mileage,
        data.lane,
        data.damage_condition,
        data.improvement_method,
        data.supervision_review,
        data.follow_up_method,
        data.completion_time,
        data.location_type,
        data.photo
      );
      
      res.status(201).json({ id: result.lastInsertRowid, ...data });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'Failed to create report' });
    }
  });

  app.put('/api/reports/:id', (req, res) => {
    try {
      const data = req.body;
      const stmt = db.prepare(`
        UPDATE reports SET
          item_number = ?, log_time = ?, highway = ?, direction = ?, mileage = ?, lane = ?, 
          damage_condition = ?, improvement_method = ?, supervision_review = ?, 
          follow_up_method = ?, completion_time = ?, location_type = ?, photo = ?
        WHERE id = ?
      `);
      
      stmt.run(
        data.item_number,
        data.log_time,
        data.highway,
        data.direction,
        data.mileage,
        data.lane,
        data.damage_condition,
        data.improvement_method,
        data.supervision_review,
        data.follow_up_method,
        data.completion_time,
        data.location_type,
        data.photo,
        req.params.id
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).json({ error: 'Failed to update report' });
    }
  });

  app.delete('/api/reports/:id', (req, res) => {
    try {
      const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
      stmt.run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting report:', error);
      res.status(500).json({ error: 'Failed to delete report' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
