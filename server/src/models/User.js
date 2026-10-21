import mongoose from 'mongoose';
import { ROLES, ROLE_VALUES } from '../constants/roles.js';
import { toJSONPlugin } from './plugins/toJSON.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Business identifier used in order files ("Assigned employee" column), e.g. EMP001.
    employeeCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // select:false -> never loaded unless a query explicitly asks for it (+passwordHash).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.EMPLOYEE },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, hiddenFields: ['passwordHash'] },
);

// Supports "list active employees" (task assignment dropdowns, workload widgets).
userSchema.index({ role: 1, isActive: 1 });

userSchema.plugin(toJSONPlugin);

export const User = mongoose.model('User', userSchema);
