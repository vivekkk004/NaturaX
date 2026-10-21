import * as orderService from './order.service.js';

export async function list(req, res) {
  res.json(await orderService.listOrders(req.validatedQuery, req.user));
}

export async function getById(req, res) {
  res.json({ data: await orderService.getOrder(req.params.id, req.user) });
}
