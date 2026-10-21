import { User } from '../../models/User.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors/index.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';
import { hashPassword, revokeAllSessions } from '../auth/auth.service.js';

export async function listUsers({ page, limit, sort, role, isActive, search }) {
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { employeeCode: pattern }];
  }
  return paginate(User, filter, { page, limit, sort });
}

export async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function createUser({ password, ...fields }) {
  // Friendly message first; the unique indexes still guarantee correctness under races.
  const clash = await User.findOne({
    $or: [{ email: fields.email }, { employeeCode: fields.employeeCode }],
  });
  if (clash) {
    const field = clash.email === fields.email ? 'email' : 'employeeCode';
    throw new ConflictError(`A user with this ${field} already exists`, { field });
  }

  return User.create({ ...fields, passwordHash: await hashPassword(password) });
}

export async function updateUser(id, changes, actingUserId) {
  const user = await getUser(id);

  // A manager locking themselves out would leave nobody able to administer the system.
  if (user.id === actingUserId) {
    if (changes.isActive === false) throw new BadRequestError('You cannot deactivate yourself');
    if (changes.role && changes.role !== user.role) {
      throw new BadRequestError('You cannot change your own role');
    }
  }

  const { password, ...rest } = changes;
  Object.assign(user, rest);
  if (password) user.passwordHash = await hashPassword(password);
  await user.save();

  // Deactivation or a password reset must end existing sessions immediately.
  if (changes.isActive === false || password) await revokeAllSessions(user._id);

  return user;
}
