import * as userService from './user.service.js';

export async function list(req, res) {
  res.json(await userService.listUsers(req.validatedQuery));
}

export async function getById(req, res) {
  res.json({ data: await userService.getUser(req.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await userService.createUser(req.body) });
}

export async function update(req, res) {
  res.json({ data: await userService.updateUser(req.params.id, req.body, req.user.id) });
}
