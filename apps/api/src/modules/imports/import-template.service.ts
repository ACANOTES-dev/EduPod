import { BadRequestException, Injectable } from '@nestjs/common';
import type { ImportType } from '@school/shared';
import ExcelJS from 'exceljs';

// ─── Column Definition Types ──────────────────────────────────────────────

interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  width: number;
  comment?: string;
  validation?: ExcelJS.DataValidation;
  example: string;
  numberFormat?: string;
}

// ─── Colour Constants ─────────────────────────────────────────────────────

const REQUIRED_HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A5C3A' },
};

const OPTIONAL_HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4A8C6A' },
};

const HEADER_FONT_REQUIRED: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

const HEADER_FONT_OPTIONAL: Partial<ExcelJS.Font> = {
  bold: false,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

const EXAMPLE_FONT: Partial<ExcelJS.Font> = {
  italic: true,
  color: { argb: 'FF888888' },
  size: 11,
};

// ─── Validation Helpers ───────────────────────────────────────────────────

function listValidation(values: string[]): ExcelJS.DataValidation {
  return {
    type: 'list',
    allowBlank: true,
    formulae: [`"${values.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid value',
    error: `Must be one of: ${values.join(', ')}`,
  };
}

// ─── Template Column Definitions ──────────────────────────────────────────

const STUDENT_COLUMNS: TemplateColumn[] = [
  { key: 'first_name', header: 'first_name *', required: true, width: 15, comment: "Student's first name", example: 'Aisha' },
  { key: 'last_name', header: 'last_name *', required: true, width: 15, comment: "Student's last name", example: 'Al-Mansour' },
  { key: 'middle_name', header: 'middle_name', required: false, width: 15, comment: 'Optional middle name', example: '' },
  { key: 'date_of_birth', header: 'date_of_birth *', required: true, width: 16, comment: 'Format: YYYY-MM-DD. Student must be 3-25 years old', example: '2015-03-15', numberFormat: 'yyyy-mm-dd' },
  { key: 'gender', header: 'gender *', required: true, width: 10, comment: 'Select male or female', example: 'female', validation: listValidation(['male', 'female']) },
  { key: 'year_group', header: 'year_group *', required: true, width: 16, comment: 'Must match an existing year group', example: 'Year 1', validation: listValidation(['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6']) },
  { key: 'class_name', header: 'class_name', required: false, width: 12, comment: 'e.g. Y1A, Y1B. Leave blank for auto-assignment', example: 'Y1A' },
  { key: 'nationality', header: 'nationality', required: false, width: 12, comment: '2-letter country code e.g. AE, GB, US', example: 'AE' },
  { key: 'medical_notes', header: 'medical_notes', required: false, width: 25, comment: 'Free text medical information', example: '' },
  { key: 'allergies', header: 'allergies', required: false, width: 20, comment: 'e.g. peanuts, dairy. Leave blank if none', example: '' },
  { key: 'dietary_requirements', header: 'dietary_requirements', required: false, width: 20, comment: 'e.g. halal, vegetarian. Leave blank if none', example: 'halal' },
  { key: 'parent1_first_name', header: 'parent1_first_name *', required: true, width: 18, comment: 'Primary parent/guardian first name', example: 'Ahmed' },
  { key: 'parent1_last_name', header: 'parent1_last_name *', required: true, width: 18, comment: 'Primary parent/guardian last name', example: 'Al-Mansour' },
  { key: 'parent1_email', header: 'parent1_email *', required: true, width: 25, comment: 'Valid email address', example: 'ahmed@example.com' },
  { key: 'parent1_phone', header: 'parent1_phone *', required: true, width: 18, comment: 'With country code e.g. +971501234567', example: '+971501234567' },
  { key: 'parent1_relationship', header: 'parent1_relationship *', required: true, width: 20, comment: 'Relationship to student', example: 'father', validation: listValidation(['father', 'mother', 'guardian', 'other']) },
  { key: 'parent2_first_name', header: 'parent2_first_name', required: false, width: 18, comment: 'Second parent (optional)', example: 'Fatima' },
  { key: 'parent2_last_name', header: 'parent2_last_name', required: false, width: 18, comment: '', example: 'Al-Mansour' },
  { key: 'parent2_email', header: 'parent2_email', required: false, width: 25, comment: '', example: 'fatima@example.com' },
  { key: 'parent2_phone', header: 'parent2_phone', required: false, width: 18, comment: '', example: '+971509876543' },
  { key: 'parent2_relationship', header: 'parent2_relationship', required: false, width: 20, comment: '', example: 'mother', validation: listValidation(['father', 'mother', 'guardian', 'other']) },
  { key: 'household_name', header: 'household_name', required: false, width: 22, comment: 'Auto-generated from parent surname if blank', example: '' },
  { key: 'address_line1', header: 'address_line1 *', required: true, width: 30, comment: 'Street address', example: '123 Al Wasl Road' },
  { key: 'address_line2', header: 'address_line2', required: false, width: 25, comment: 'Apartment, suite, etc.', example: 'Villa 5' },
  { key: 'city', header: 'city *', required: true, width: 15, comment: 'City name', example: 'Dubai' },
  { key: 'country', header: 'country *', required: true, width: 12, comment: 'Country name or code', example: 'AE' },
  { key: 'postal_code', header: 'postal_code', required: false, width: 12, comment: 'Postal/ZIP code', example: '12345' },
];

const PARENT_COLUMNS: TemplateColumn[] = [
  { key: 'first_name', header: 'first_name *', required: true, width: 15, comment: 'Parent first name', example: 'Ahmed' },
  { key: 'last_name', header: 'last_name *', required: true, width: 15, comment: 'Parent last name', example: 'Al-Mansour' },
  { key: 'email', header: 'email *', required: true, width: 25, comment: 'Valid email address', example: 'ahmed@example.com' },
  { key: 'phone', header: 'phone *', required: true, width: 18, comment: 'With country code e.g. +971501234567', example: '+971501234567' },
  { key: 'relationship', header: 'relationship *', required: true, width: 15, comment: 'Relationship to student', example: 'father', validation: listValidation(['father', 'mother', 'guardian', 'other']) },
  { key: 'household_name', header: 'household_name', required: false, width: 22, comment: 'Optional household name', example: 'The Al-Mansour Family' },
];

const STAFF_COLUMNS: TemplateColumn[] = [
  { key: 'first_name', header: 'first_name *', required: true, width: 15, comment: 'Staff first name', example: 'Sarah' },
  { key: 'last_name', header: 'last_name *', required: true, width: 15, comment: 'Staff last name', example: 'Johnson' },
  { key: 'email', header: 'email *', required: true, width: 25, comment: 'Valid email address', example: 'sarah.j@school.edu' },
  { key: 'phone', header: 'phone', required: false, width: 18, comment: 'With country code', example: '+971501234567' },
  { key: 'job_title', header: 'job_title *', required: true, width: 22, comment: 'Job title', example: 'Mathematics Teacher' },
  { key: 'department', header: 'department', required: false, width: 18, comment: 'Department name', example: 'Mathematics' },
  { key: 'employment_type', header: 'employment_type *', required: true, width: 18, comment: 'Employment type', example: 'full_time', validation: listValidation(['full_time', 'part_time', 'contract']) },
  { key: 'start_date', header: 'start_date', required: false, width: 14, comment: 'Format: YYYY-MM-DD', example: '2025-09-01', numberFormat: 'yyyy-mm-dd' },
];

const FEES_COLUMNS: TemplateColumn[] = [
  { key: 'household_name', header: 'household_name *', required: true, width: 22, comment: 'Must match an existing household', example: 'The Al-Mansour Family' },
  { key: 'fee_structure_name', header: 'fee_structure_name *', required: true, width: 25, comment: 'Must match an existing fee structure', example: 'Tuition Fee 2025-2026' },
  { key: 'amount', header: 'amount *', required: true, width: 12, comment: 'Numeric amount', example: '35000' },
  { key: 'discount_pct', header: 'discount_pct', required: false, width: 14, comment: 'Discount percentage 0-100', example: '10' },
  { key: 'billing_period', header: 'billing_period', required: false, width: 15, comment: 'e.g. Term 1', example: 'Term 1' },
  { key: 'due_date', header: 'due_date', required: false, width: 14, comment: 'Format: YYYY-MM-DD', example: '2025-09-30', numberFormat: 'yyyy-mm-dd' },
];

const EXAM_RESULTS_COLUMNS: TemplateColumn[] = [
  { key: 'student_number', header: 'student_number *', required: true, width: 18, comment: 'Student enrolment number', example: 'MDAD-S-00001' },
  { key: 'student_name', header: 'student_name', required: false, width: 22, comment: 'For reference only, not imported', example: 'Aisha Al-Mansour' },
  { key: 'subject', header: 'subject *', required: true, width: 18, comment: 'Must match an existing subject', example: 'Mathematics' },
  { key: 'assessment_name', header: 'assessment_name *', required: true, width: 22, comment: 'Must match an existing assessment', example: 'Mid-Term Exam' },
  { key: 'score', header: 'score *', required: true, width: 10, comment: 'Numeric score', example: '85' },
  { key: 'max_score', header: 'max_score *', required: true, width: 12, comment: 'Maximum possible score', example: '100' },
  { key: 'grade', header: 'grade', required: false, width: 8, comment: 'Letter grade (optional)', example: 'A' },
  { key: 'term', header: 'term', required: false, width: 10, comment: 'e.g. Term 1', example: 'Term 1' },
];

const STAFF_COMPENSATION_COLUMNS: TemplateColumn[] = [
  { key: 'staff_number', header: 'staff_number *', required: true, width: 16, comment: 'Staff identification number', example: 'STF-001' },
  { key: 'staff_name', header: 'staff_name', required: false, width: 20, comment: 'For reference only, not imported', example: 'Sarah Johnson' },
  { key: 'compensation_type', header: 'compensation_type *', required: true, width: 20, comment: 'Type of compensation', example: 'salaried', validation: listValidation(['salaried', 'per_class', 'hourly']) },
  { key: 'amount', header: 'amount *', required: true, width: 12, comment: 'Numeric amount', example: '15000' },
  { key: 'effective_from', header: 'effective_from *', required: true, width: 16, comment: 'Start date YYYY-MM-DD', example: '2025-09-01', numberFormat: 'yyyy-mm-dd' },
  { key: 'effective_to', header: 'effective_to', required: false, width: 14, comment: 'End date YYYY-MM-DD (optional)', example: '2026-08-31', numberFormat: 'yyyy-mm-dd' },
  { key: 'currency', header: 'currency', required: false, width: 10, comment: 'Currency code e.g. AED', example: 'AED' },
];

const TEMPLATE_COLUMNS: Record<ImportType, TemplateColumn[]> = {
  students: STUDENT_COLUMNS,
  parents: PARENT_COLUMNS,
  staff: STAFF_COLUMNS,
  fees: FEES_COLUMNS,
  exam_results: EXAM_RESULTS_COLUMNS,
  staff_compensation: STAFF_COMPENSATION_COLUMNS,
};

const VALID_IMPORT_TYPES: ImportType[] = [
  'students',
  'parents',
  'staff',
  'fees',
  'exam_results',
  'staff_compensation',
];

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class ImportTemplateService {
  /**
   * Generate a styled XLSX template with data validation for the given import type.
   * Returns a Buffer containing the XLSX file.
   */
  async generateTemplate(importType: ImportType): Promise<Buffer> {
    if (!VALID_IMPORT_TYPES.includes(importType)) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_TYPE',
        message: `Unknown import type: "${String(importType)}"`,
      });
    }

    const columns = TEMPLATE_COLUMNS[importType];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School OS';
    workbook.created = new Date();

    // ─── Sheet 1: Import Data ──────────────────────────────────────────
    const dataSheet = workbook.addWorksheet('Import Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Set up columns
    dataSheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    // Style header row (row 1)
    const headerRow = dataSheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const colDef = columns[colNumber - 1];
      if (!colDef) return;

      cell.fill = colDef.required ? REQUIRED_HEADER_FILL : OPTIONAL_HEADER_FILL;
      cell.font = colDef.required ? HEADER_FONT_REQUIRED : HEADER_FONT_OPTIONAL;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
      };

      // Add cell comment/note with hint text
      if (colDef.comment) {
        cell.note = colDef.comment;
      }
    });
    headerRow.height = 24;

    // Add example row (row 2)
    const exampleData: Record<string, string> = {};
    for (const col of columns) {
      exampleData[col.key] = col.example;
    }
    dataSheet.addRow(exampleData);

    const exampleRow = dataSheet.getRow(2);
    exampleRow.eachCell((cell) => {
      cell.font = EXAMPLE_FONT;
    });

    // Apply data validation and number formats for the data region (rows 2 through 1000)
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const colDef = columns[colIdx];
      if (!colDef) continue;

      const excelCol = dataSheet.getColumn(colIdx + 1);

      // Set date format for date columns
      if (colDef.numberFormat) {
        excelCol.numFmt = colDef.numberFormat;
      }

      // Apply data validation to rows 2-1000
      if (colDef.validation) {
        for (let rowIdx = 2; rowIdx <= 1000; rowIdx++) {
          const cell = dataSheet.getCell(rowIdx, colIdx + 1);
          cell.dataValidation = colDef.validation;
        }
      }
    }

    // ─── Sheet 2: Instructions ─────────────────────────────────────────
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.getColumn(1).width = 80;

    const titleRow = instrSheet.addRow(['Bulk Import Instructions']);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 16 };

    instrSheet.addRow([]); // blank row

    const instructions = [
      "1. Fill in the 'Import Data' sheet starting from row 3 (row 2 is an example)",
      '2. Required columns are marked with darker green headers and an asterisk (*)',
      '3. Do not modify or delete the header row',
      '4. Dropdown fields will show valid options when you click the cell',
      '5. Dates must be in YYYY-MM-DD format',
      '6. Delete the example row (row 2) before uploading',
      '7. Save the file and upload it on the Import page',
    ];

    for (const instruction of instructions) {
      const row = instrSheet.addRow([instruction]);
      row.getCell(1).font = { size: 11 };
    }

    // Write to buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
