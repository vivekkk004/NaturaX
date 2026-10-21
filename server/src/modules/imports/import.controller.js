import * as importService from './import.service.js';

export async function upload(req, res) {
  // From here on the import record owns the file, so the upload middleware must not delete it.
  res.locals.uploadClaimed = true;
  const batch = await importService.importOrders({
    file: req.file,
    actor: { id: req.user.id, name: req.user.name },
    asOf: req.body.asOf,
  });
  res.status(201).json({ data: batch });
}

export async function list(req, res) {
  res.json(await importService.listImports(req.validatedQuery));
}

export async function getById(req, res) {
  res.json({ data: await importService.getImport(req.params.id) });
}

export async function downloadFile(req, res) {
  const { absolutePath, downloadName } = await importService.getImportFile(req.params.id);
  // The path is server-generated and verified to be inside the upload folder, so a dot-folder
  // (e.g. UPLOAD_DIR=.data/uploads) is safe to serve.
  res.download(absolutePath, downloadName, { dotfiles: 'allow' });
}
