import { startOfIstDay } from '../../utils/dates.js';
import * as reportService from './report.service.js';

const reportDate = (req) => req.validatedQuery.date ?? startOfIstDay(new Date());

export async function daily(req, res) {
  res.json({ data: await reportService.getDailyReport({ date: reportDate(req) }) });
}

export async function dailyCsv(req, res) {
  await reportService.streamDailyReportCsv(res, {
    date: reportDate(req),
    section: req.validatedQuery.section,
  });
}
