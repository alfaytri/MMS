import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import XLSX from 'xlsx';

const spec = JSON.parse(readFileSync('scripts/test-cases/purchase_warehouse_spec.json', 'utf8'));
const outPath = 'docs/test-cases/Purchase_Warehouse_Tests.xlsx';

const wb = XLSX.utils.book_new();

// 1. Build each test sheet first (so we can count rows for summary)
const sheetInfo = [];

for (const s of spec.sheets) {
  if (s.type === 'summary') continue;

  const rows = s.rows.map(r => ({
    'Test ID': r.id,
    'Scenario': r.scenario,
    'Preconditions': r.preconditions,
    'Steps': r.steps,
    'Input values': r.input,
    'Expected result': r.expected,
    'Actual': '',
    'Pass/Fail': '',
    'Notes': '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 10 },   // Test ID
    { wch: 45 },   // Scenario
    { wch: 50 },   // Preconditions
    { wch: 60 },   // Steps
    { wch: 45 },   // Input values
    { wch: 55 },   // Expected result
    { wch: 25 },   // Actual
    { wch: 12 },   // Pass/Fail
    { wch: 30 },   // Notes
  ];

  // Set row heights for multiline content (header + data rows)
  ws['!rows'] = [{ hpt: 20 }]; // header row
  for (let i = 0; i < rows.length; i++) {
    ws['!rows'].push({ hpt: 80 }); // data rows get more height for readability
  }

  XLSX.utils.book_append_sheet(wb, ws, s.name);

  sheetInfo.push({
    'Sheet': s.name,
    'Route': s.route || '',
    '# Tests': s.rows.length,
    'Coverage': s.coverageNotes || '',
  });
}

// 2. Build Summary sheet and insert it first
const summaryWs = XLSX.utils.json_to_sheet(sheetInfo);
summaryWs['!cols'] = [
  { wch: 20 },   // Sheet
  { wch: 40 },   // Route
  { wch: 10 },   // # Tests
  { wch: 60 },   // Coverage
];

// Add a totals row to summary
const totalTests = sheetInfo.reduce((sum, s) => sum + s['# Tests'], 0);
XLSX.utils.sheet_add_aoa(summaryWs, [['TOTAL', '', totalTests, '']], { origin: -1 });

// Build final workbook with Summary first
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, summaryWs, 'Summary');

// Copy all test sheets from wb to wb2
for (const name of wb.SheetNames) {
  XLSX.utils.book_append_sheet(wb2, wb.Sheets[name], name);
}

// 3. Write the workbook
mkdirSync(dirname(outPath), { recursive: true });
XLSX.writeFile(wb2, outPath);

console.log(`Wrote ${outPath}`);
console.log(`  Sheets: ${wb2.SheetNames.length} (Summary + ${wb2.SheetNames.length - 1} test sheets)`);
console.log(`  Total test cases: ${totalTests}`);
