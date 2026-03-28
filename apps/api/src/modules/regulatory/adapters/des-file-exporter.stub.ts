import { Injectable } from '@nestjs/common';
import type { DesFileType } from '@school/shared';

import type { DesColumnDef, DesFileExporter, DesFileExportResult, DesFileRow } from './des-file-exporter.interface';

@Injectable()
export class DesFileExporterStub implements DesFileExporter {
  export(fileType: DesFileType, rows: DesFileRow[], columns: DesColumnDef[]): DesFileExportResult {
    const content = Buffer.from(
      JSON.stringify(
        {
          fileType,
          columns: columns.map((c) => c.header),
          rows,
        },
        null,
        2,
      ),
    );

    return {
      content,
      filename: `des_${fileType}_stub.json`,
      content_type: 'application/json',
      record_count: rows.length,
    };
  }
}
