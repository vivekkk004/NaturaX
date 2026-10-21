import * as taskService from './task.service.js';

/** The acting user as the services need it: id + role for permissions, name for the audit trail. */
const actorOf = (req) => ({ id: req.user.id, role: req.user.role, name: req.user.name });

export async function list(req, res) {
  res.json(await taskService.listTasks(req.validatedQuery, req.user));
}

export async function getById(req, res) {
  res.json({ data: await taskService.getTask(req.params.id, req.user) });
}

export async function history(req, res) {
  res.json({ data: await taskService.getTaskHistory(req.params.id, req.user) });
}

export async function updateStatus(req, res) {
  res.json({ data: await taskService.updateTaskStatus(req.params.id, req.body, actorOf(req)) });
}

export async function assign(req, res) {
  res.json({ data: await taskService.assignTask(req.params.id, req.body, actorOf(req)) });
}
