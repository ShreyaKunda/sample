const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { processTailNumber, updateAllAircraftsSummary } = require('./script');

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = './uploads/';
const logsDir = './logs/';
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(logsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

/** Minimal CSV parser used only for tailNumber detection from CSVs */
function parseCSV(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result.map(s => s.trim());
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
        const cols = parseLine(line);
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = (cols[idx] ?? '').replace(/^"|"$/g, '');
        });
        return obj;
    });

    return { headers, rows };
}

function detectTailNumberFromCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const { headers, rows } = parseCSV(content);
        const headerMap = {};
        headers.forEach(h => headerMap[h.toLowerCase()] = h);

        // Try typical tail number headers
        const candidates = ['aircraft_id', 'tailnumber', 'tail_number'];
        let col = null;
        for (const c of candidates) {
            if (headerMap[c]) { col = headerMap[c]; break; }
        }
        if (!col) return null;

        for (const row of rows) {
            const val = (row[col] || '').trim();
            if (val && val.toUpperCase() !== 'INVALID') {
                return val;
            }
        }
        return null;
    } catch (e) {
        console.warn(`⚠️ Failed to parse CSV for tail number: ${path.basename(filePath)}.`, e.message || e);
        return null;
    }
}

/** Process ZIP file (existing logic) */
async function processZipFile(file) {
    const zipPath = path.join(uploadDir, file.filename);
    const extractedPath = path.join(uploadDir, `extracted_${Date.now()}`);
    fs.emptyDirSync(extractedPath);

    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractedPath }))
        .promise();

    const nestedZip = fs.readdirSync(extractedPath).find(f => f.startsWith("operational-logs") && f.endsWith(".zip"));
    if (!nestedZip) {
        console.warn(`No nested operational zip in ${file.filename}`);
        return null;
    }

    const nestedZipPath = path.join(extractedPath, nestedZip);
    const nestedExtracted = path.join(extractedPath, 'nested');
    fs.ensureDirSync(nestedExtracted);
    await fs.createReadStream(nestedZipPath)
        .pipe(unzipper.Extract({ path: nestedExtracted }))
        .promise();

    // Collect both DB and CSV files, skip system_cmc
    const allFiles = fs.readdirSync(nestedExtracted).filter(f => !f.toLowerCase().startsWith('system_cmc'));
    const dbFiles = allFiles.filter(f => f.endsWith('.db'));
    const csvFiles = allFiles.filter(f => f.endsWith('.csv'));

    if (dbFiles.length === 0 && csvFiles.length === 0) {
        console.warn(`No .db or .csv files found in ${nestedZip}`);
        return null;
    }

    // Determine tailNumber: try DBs first, then CSVs
    let tailNumber = null;
    for (const dbFile of dbFiles) {
        const dbPath = path.join(nestedExtracted, dbFile);
        const db = new sqlite3.Database(dbPath);
        await new Promise((resolve) => {
            db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
                if (err || !tables.length) { db.close(); return resolve(); }
                const tableName = tables.find(t => t.name.toLowerCase().includes('operational'))?.name || tables[0].name;
                db.all(`SELECT aircraft_id FROM ${tableName} WHERE aircraft_id IS NOT NULL AND aircraft_id != 'INVALID' LIMIT 1`, (err2, rows) => {
                    if (rows && rows.length > 0 && !tailNumber) {
                        tailNumber = rows[0].aircraft_id;
                    }
                    db.close();
                    resolve();
                });
            });
        });
        if (tailNumber) break;
    }

    if (!tailNumber) {
        // Attempt detection from CSVs
        for (const csvFile of csvFiles) {
            const csvPath = path.join(nestedExtracted, csvFile);
            tailNumber = detectTailNumberFromCSV(csvPath);
            if (tailNumber) break;
        }
    }

    if (!tailNumber) {
        console.warn(`No valid tail number found in ${file.filename}`);
        return null;
    }

    const tailDir = path.join(logsDir, `${tailNumber}_Logs`);
    fs.ensureDirSync(tailDir);

    // Copy DB files
    for (const dbFile of dbFiles) {
        const src = path.join(nestedExtracted, dbFile);
        const uniqueName = `${dbFile.replace('.db', '')}_${Date.now()}.db`;
        const dest = path.join(tailDir, uniqueName);
        fs.copyFileSync(src, dest);
    }

    // Copy CSV files
    for (const csvFile of csvFiles) {
        const src = path.join(nestedExtracted, csvFile);
        const uniqueName = `${csvFile.replace('.csv', '')}_${Date.now()}.csv`;
        const dest = path.join(tailDir, uniqueName);
        fs.copyFileSync(src, dest);
    }

    console.log(`Saved ${dbFiles.length} DB and ${csvFiles.length} CSV logs to ${tailDir}`);
    return tailNumber;
}

/** Process individual CSV files */
async function processCSVFiles(files) {
    // Filter CSV files that match expected system types
    const validSystemTypes = ['system_usage', 'system_operational', 'system_fault', 'system_security'];
    const csvFiles = files.filter(file => {
        const name = file.filename.toLowerCase().replace('.csv', '');
        return validSystemTypes.some(type => name.includes(type));
    });

    if (csvFiles.length === 0) {
        console.warn('❌ No valid system CSV files found');
        return null;
    }

    // Detect tail number from the first CSV file
    let tailNumber = null;
    for (const file of csvFiles) {
        const filePath = path.join(uploadDir, file.filename);
        tailNumber = detectTailNumberFromCSV(filePath);
        if (tailNumber) break;
    }

    if (!tailNumber) {
        console.warn('❌ Could not detect tail number from CSV files');
        return null;
    }

    const tailDir = path.join(logsDir, `${tailNumber}_Logs`);
    fs.ensureDirSync(tailDir);

    // Copy CSV files to tail directory
    for (const file of csvFiles) {
        const src = path.join(uploadDir, file.filename);
        const baseName = path.basename(file.filename, '.csv');
        const uniqueName = `${baseName}_${Date.now()}.csv`;
        const dest = path.join(tailDir, uniqueName);
        fs.copyFileSync(src, dest);
        console.log(`✅ Saved CSV: ${uniqueName}`);
    }

    console.log(`✅ Saved ${csvFiles.length} CSV files to ${tailDir}`);
    return tailNumber;
}

const initializeExistingLogs = async () => {
    console.log("🔄 Processing existing logs...");
    const folders = fs.readdirSync(logsDir).filter(name => name.endsWith('_Logs'));
    for (const folder of folders) {
        const tailNumber = folder.replace('_Logs', '');
        console.log(`📂 Found logs for: ${tailNumber}`);
        await processTailNumber(tailNumber);
    }
    await updateAllAircraftsSummary();
    console.log("✅ All existing logs have been processed!");
};
initializeExistingLogs();

app.post('/upload', upload.array('logFile'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: "❌ No files uploaded!" });
        }

        const processedTailNumbers = new Set();

        // Separate ZIP and CSV files
        const zipFiles = req.files.filter(f => f.filename.endsWith('.zip'));
        const csvFiles = req.files.filter(f => f.filename.endsWith('.csv'));

        // Process ZIP files
        for (const file of zipFiles) {
            const tailNumber = await processZipFile(file);
            if (tailNumber) {
                processedTailNumbers.add(tailNumber);
                await processTailNumber(tailNumber);
            }
        }

        // Process CSV files (if any)
        if (csvFiles.length > 0) {
            const tailNumber = await processCSVFiles(csvFiles);
            if (tailNumber) {
                processedTailNumbers.add(tailNumber);
                await processTailNumber(tailNumber);
            }
        }

        if (processedTailNumbers.size === 0) {
            return res.status(400).json({ message: "❌ No valid files could be processed!" });
        }

        await updateAllAircraftsSummary();
        res.json({ 
            message: "✅ Files processed successfully!",
            tailNumbers: Array.from(processedTailNumbers)
        });

    } catch (error) {
        console.error("❌ Error in /upload:", error);
        res.status(500).json({ message: "❌ Internal server error!", error: error.message });
    }
});

app.get('/tailNumbers', (req, res) => {
    const folders = fs.readdirSync(logsDir).filter(name => name.endsWith('_Logs'));
    const tailNumbers = folders.map(folder => folder.replace('_Logs', ''));
    res.json({ tailNumbers });
});

app.get('/analytics/:tailNumber', (req, res) => {
    const tailNumber = req.params.tailNumber;
    const filePath = tailNumber === "all"
        ? "./analytics/analytics_all.json"
        : `./analytics/${tailNumber}_analytics.json`;
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.status(404).json({ message: "❌ No analytics data found." });
    }
});

app.get('/timeline/:tailNumber', (req, res) => {
    const tailNumber = req.params.tailNumber;
    const filePath = tailNumber === "all"
        ? "./analytics/timeline_all.json"
        : `./analytics/${tailNumber}_timeline.json`;
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.status(404).json({ message: "❌ No timeline data found." });
    }
});

app.get('/summary', (req, res) => {
    const filePath = "./analytics/summary.json";
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.status(404).json({ message: "❌ No summary data found." });
    }
});

app.listen(5000, () => console.log("✅ Server running on port 5000"));
