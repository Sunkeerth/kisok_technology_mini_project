const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MySQL connection setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Sunkee@123', // Replace with your MySQL password
  database: 'qr_data_db', // Replace with your database name
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');
});

// Endpoint to save scanned data (QR Code)
app.post('/api/save-scanned-data', (req, res) => {
  const qrData = req.body.qrData;

  // Parse the scanned QR data
  const parsedData = parseScannedData(qrData);

  if (!parsedData || parsedData.invalid) {
    return res.status(400).json({ message: 'Invalid QR Code data format' });
  }

  const query = `INSERT INTO scanned_data (name, usn, branch, dob, passout, mobile_no) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [
    parsedData.name,
    parsedData.usn,
    parsedData.branch,
    parsedData.dob || null,
    parsedData.passout || null,
    parsedData.mobile_no || null,
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error saving data:', err);
      return res.status(500).json({ message: 'Failed to save data' });
    }
    res.status(200).json({ message: 'QR data saved successfully', userId: result.insertId });
  });
});

// Endpoint to fetch the most recent user ID
app.get('/api/get-recent-user-id', (req, res) => {
  const query = 'SELECT id FROM scanned_data ORDER BY id DESC LIMIT 1';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching recent user ID:', err);
      return res.status(500).json({ message: 'Failed to fetch recent user ID' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No users found.' });
    }

    res.status(200).json({ recentUserId: results[0].id });
  });
});

// Endpoint to save symptoms data
app.post('/api/save-symptoms', (req, res) => {
  const { symptoms, severity, userId } = req.body;
  const dateReported = new Date();  // Date of reporting

  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ message: 'No symptoms provided.' });
  }

  const fetchSymptomIdQuery = `SELECT id FROM symptoms WHERE symptom_name = ?`;  // Update to match the column name
  const symptomPromises = symptoms.map(symptom => {
    return new Promise((resolve, reject) => {
      db.query(fetchSymptomIdQuery, [symptom], (err, results) => {
        if (err) return reject(err);
        if (results.length === 0) return reject(`Symptom '${symptom}' not found`);
        resolve(results[0].id);
      });
    });
  });

  Promise.allSettled(symptomPromises)
    .then(results => {
      const validSymptoms = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      const invalidSymptoms = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);

      if (validSymptoms.length === 0) {
        return res.status(400).json({ message: 'No valid symptoms found.' });
      }

      // Insert valid symptoms into the user_symptoms table
      const values = validSymptoms.map(symptomId => [
        userId, symptomId, severity, dateReported,
      ]);

      const insertSymptomsQuery = 'INSERT INTO user_symptoms (user_id, symptom_id, severity, date_reported) VALUES ?';
      db.query(insertSymptomsQuery, [values], (err, result) => {
        if (err) {
          console.error('Error saving symptoms data:', err);
          return res.status(500).json({ message: 'Failed to save symptoms data' });
        }
        res.status(200).json({ message: 'Symptoms data saved successfully', invalidSymptoms });
      });
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      res.status(500).json({ message: 'An unexpected error occurred' });
    });
});

// Function to parse the scanned QR data (based on Aadhaar or college format)
function parseScannedData(data) {
  const parts = data.split(" ");
  if (parts.length >= 10) {
    return {
      name: `${parts[0]} ${parts[1]} ${parts[2]}`.trim(),
      usn: parts[10].trim(),
      branch: parts[6].trim(),
      dob: isValidDate(parts[7]) ? parts[7] : null,
      passout: isValidInteger(parts[8]) ? parts[8] : null,
      mobile_no: parts[10].trim()
    };
  } else {
    return { invalid: true };
  }
}

// Validation functions
function isValidDate(date) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  return regex.test(date);
}

function isValidInteger(value) {
  return /^\d+$/.test(value);
}

// Endpoint to fetch user scanned data
app.get('/api/get-scanned-data/:userId', (req, res) => {
  const userId = req.params.userId;
  const query = `SELECT * FROM scanned_data WHERE id = ?`;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching scanned data:', err);
      return res.status(500).json({ message: 'Failed to fetch data' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No data found for this user.' });
    }

    res.status(200).json({ userData: results[0] });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
