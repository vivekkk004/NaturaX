import { api } from './api';
import { filenameFromDisposition, saveBlob } from '../utils/download';

export const reportService = {
  async daily(date) {
    const { data } = await api.get('/reports/daily', { params: { date } });
    return data.data;
  },
  /**
   * The CSV endpoint needs the Authorization header, so a plain <a href> would not work:
   * fetch it as a Blob through the authenticated client, then save it.
   */
  async downloadCsv(date, section = 'all') {
    const response = await api.get('/reports/daily/csv', {
      params: { date, section },
      responseType: 'blob',
      timeout: 120_000,
    });
    const filename = filenameFromDisposition(
      response.headers['content-disposition'],
      `daily-exception-report-${date}.csv`,
    );
    saveBlob(response.data, filename);
    return filename;
  },
};
