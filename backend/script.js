
const fs = require('fs-extra');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const faultRulesFilePath = 'rules_fault.json';
const eventRulesFilePath = 'rules_event.json';
const logsPath = './logs/';
const analyticsPath = './analytics/';

const readRules = () => JSON.parse(fs.readFileSync(faultRulesFilePath, 'utf8'));
const readEventRules = () => JSON.parse(fs.readFileSync(eventRulesFilePath, 'utf8'));

const formatTooltip = (additionalText, formattedKeys) => {
    const values = (additionalText || '').split(';');
    let formattedTooltip = '';
    if (values.length === formattedKeys.length) {
        formattedKeys.forEach((key, index) => {
            formattedTooltip += `<br/><b>${key}</b>: ${values[index]}`;
        });
    }
    return formattedTooltip.trim();
};

// Shared row handler for both DB rows and CSV rows
const handleRow = (row, dbType, faultsMap, eventsMap, analytics, timeline, summary) => {
    const faultText = row.L3_text;
    const matchedFault = faultsMap.find(fault => fault.fault === faultText && fault.db === dbType);
    const matchedEvent = eventsMap.find(event => event.event === faultText && event.db === dbType);
    const isFault = Boolean(matchedFault);
    const isEvent = Boolean(matchedEvent);
    const color = isFault ? 'red' : 'blue';

    if (isFault) {
        analytics.push({
            L3_text: faultText,
            datetime: `${row.system_date} ${row.system_time}`,
            power_on_counter: row.power_on_counter,
            module: matchedFault.module
        });
    }

    let tooltip = row.additional_text;
    if (isFault && matchedFault?.additional_text) {
        const keys = matchedFault.additional_text.split(';');
        tooltip = formatTooltip(row.additional_text, keys);
    } else if (!isFault && isEvent && matchedEvent?.additional_text) {
        const keys = matchedEvent.additional_text.split(';');
        tooltip = formatTooltip(row.additional_text, keys);
    }

    timeline.push({
        start: `${row.system_date} ${row.system_time}`,
        content: row.L3_text,
        group: row.power_on_counter,
        tooltip,
        module: row.L2_text,
        style: `color: white; background-color: ${color};`
    });

    summary.total_logs++;
    if (isFault) summary.total_faults++;
};

const processDB = async (filePath, dbType, faultsMap, eventsMap, analytics, timeline, summary) => {
    if (!fs.existsSync(filePath)) return;
    const db = new sqlite3.Database(filePath);

    const tableName = await new Promise((resolve, reject) => {
        db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
            if (err || !tables?.length) return reject(err || new Error('No tables found'));
            const target = tables.find(t => String(t.name).toLowerCase().includes('operational'));
            resolve(target?.name || tables[0].name);
        });
    });

    await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
            if (err) {
                db.close();
                return reject(err);
            }
            rows.forEach(row => {
                // Normalize SQLite row keys to expected names
                const normalized = {
                    L3_text: row.L3_text ?? row.l3_text ?? row['L3_text'],
                    system_date: row.system_date ?? row['system_date'],
                    system_time: row.system_time ?? row['system_time'],
                    power_on_counter: row.power_on_counter ?? row['power_on_counter'],
                    L2_text: row.L2_text ?? row.l2_text ?? row['L2_text'],
                    additional_text: row.additional_text ?? row['additional_text']
                };
                handleRow(normalized, dbType, faultsMap, eventsMap, analytics, timeline, summary);
            });
            db.close();
            resolve();
        });
    });
};

// --- Minimal CSV parser (handles quoted fields and commas inside quotes) ---
function parseCSV(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Parse a single CSV line with quotes
    const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"'; // escaped quote
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

const processCSV = async (filePath, dbType, faultsMap, eventsMap, analytics, timeline, summary) => {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const { headers, rows } = parseCSV(content);

    // Expected headers (case-insensitive)
    const required = ['L3_text', 'system_date', 'system_time', 'power_on_counter', 'L2_text', 'additional_text'];

    const headerMap = {};
    required.forEach(req => {
        const found = headers.find(h => h.toLowerCase() === req.toLowerCase());
        if (!found) {
            console.warn(`⚠️ CSV missing expected header "${req}" in ${path.basename(filePath)}.`);
        }
        headerMap[req] = found || req; // fallback to req
    });

    rows.forEach(r => {
        const normalized = {
            L3_text: r[headerMap['L3_text']],
            system_date: r[headerMap['system_date']],
            system_time: r[headerMap['system_time']],
            power_on_counter: r[headerMap['power_on_counter']],
            L2_text: r[headerMap['L2_text']],
            additional_text: r[headerMap['additional_text']]
        };
        handleRow(normalized, dbType, faultsMap, eventsMap, analytics, timeline, summary);
    });
};

const processTailNumber = async (tailNumber) => {
    console.log(`🔄 Processing tail number: ${tailNumber}`);
    const tailPath = `${logsPath}${tailNumber}_Logs/`;
    if (!fs.existsSync(tailPath)) {
        console.error(`❌ ERROR: Logs folder missing for ${tailNumber}!`);
        return;
    }

    const rules = readRules();
    const eventRules = readEventRules();
    const analytics = [];
    const timeline = [];
    const summary = { total_logs: 0, total_faults: 0 };

    const files = fs.readdirSync(tailPath)
        .filter(f => (f.endsWith('.db') || f.endsWith('.csv')))
        .filter(f => !f.toLowerCase().startsWith('system_cmc')); // skip for both types

    for (const file of files) {
        const ext = path.extname(file).toLowerCase(); // .db or .csv
        const base = path.basename(file, ext);
        const dbType = base.split('_').slice(0, 2).join('_'); // keep same dbType logic
        const filePath = path.join(tailPath, file);

        try {
            if (ext === '.db') {
                await processDB(filePath, dbType, rules.faults, eventRules.events, analytics, timeline, summary);
            } else if (ext === '.csv') {
                await processCSV(filePath, dbType, rules.faults, eventRules.events, analytics, timeline, summary);
            }
        } catch (err) {
            console.error(`❌ Error processing ${file}:`, err.message || err);
        }
    }

    fs.ensureDirSync(analyticsPath);
    fs.writeFileSync(`${analyticsPath}${tailNumber}_analytics.json`, JSON.stringify({ analytics }, null, 4));
    fs.writeFileSync(`${analyticsPath}${tailNumber}_timeline.json`, JSON.stringify({ timeline }, null, 4));

    let summaryData = {};
    if (fs.existsSync(`${analyticsPath}summary.json`)) {
        summaryData = JSON.parse(fs.readFileSync(`${analyticsPath}summary.json`, 'utf8'));
    }
    summaryData[tailNumber] = summary;
    fs.writeFileSync(`${analyticsPath}summary.json`, JSON.stringify(summaryData, null, 4));

    console.log(`✅ Logs processed and saved for ${tailNumber}`);
};

const updateAllAircraftsSummary = async () => {
    console.log("🔄 Updating summary for all aircrafts...");
    let allAircraftsData = [];
    let allAircraftsTimeline = [];
    let summaryData = {};
    fs.ensureDirSync(analyticsPath);

    const folders = fs.readdirSync(logsPath).filter(name => name.endsWith('_Logs'));
    for (const folder of folders) {
        const tailNumber = folder.replace('_Logs', '');
        const analyticsFile = `${analyticsPath}${tailNumber}_analytics.json`;
        const timelineFile = `${analyticsPath}${tailNumber}_timeline.json`;
        if (fs.existsSync(analyticsFile)) {
            const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8')).analytics || [];
            for(const item of analytics) {
                allAircraftsData.push(item);
            }
        }
        if (fs.existsSync(timelineFile)) {
            const timeline = JSON.parse(fs.readFileSync(timelineFile, 'utf8')).timeline || [];
            for(const item of timeline) {
                allAircraftsTimeline.push(item);
            }
        }
        if (fs.existsSync(`${analyticsPath}summary.json`)) {
            const existingSummary = JSON.parse(fs.readFileSync(`${analyticsPath}summary.json`, 'utf8'));
            if (existingSummary[tailNumber]) {
                summaryData[tailNumber] = existingSummary[tailNumber];
            }
        }
    }

    const aircraftOnly = Object.entries(summaryData).filter(([key]) => key !=="All Aircrafts");

    summaryData["All Aircrafts"] = {
        total_logs: aircraftOnly.reduce((sum, [_, obj]) => sum + (obj.total_logs || 0), 0),
        total_faults: aircraftOnly.reduce((sum, [_, obj]) => sum + (obj.total_faults || 0), 0)
    };

    fs.writeFileSync(`${analyticsPath}analytics_all.json`, JSON.stringify({ analytics: allAircraftsData }, null, 4));
    fs.writeFileSync(`${analyticsPath}timeline_all.json`, JSON.stringify({ timeline: allAircraftsTimeline }, null, 4));
    fs.writeFileSync(`${analyticsPath}summary.json`, JSON.stringify(summaryData, null, 4));
    console.log("✅ Summary updated for all aircrafts!");
};

const processAllLogs = async () => {
    console.log("🔄 Processing all logs...");
    fs.ensureDirSync(logsPath);
    const folders = fs.readdirSync(logsPath).filter(name => name.endsWith('_Logs'));
    for (const folder of folders) {
        const tailNumber = folder.replace('_Logs', '');
        await processTailNumber(tailNumber);
    }
    await updateAllAircraftsSummary();
    console.log("✅ All logs processed successfully!");
};

if (require.main === module) {
    processAllLogs();
}

module.exports = { processTailNumber, updateAllAircraftsSummary };
