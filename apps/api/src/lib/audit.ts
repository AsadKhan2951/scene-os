import { AuditLog } from '../models';
import type { AuthUser } from '../middleware/auth';

export function audit(user: AuthUser, action: string, data: { productionId?: unknown; targetId?: unknown; detail?: unknown; via?: 'user' | 'dreamer' } = {}) {
  return AuditLog.create({
    action,
    by: user.name,
    via: data.via ?? 'user',
    productionId: data.productionId ?? undefined,
    targetId: data.targetId ? String(data.targetId) : undefined,
    detail: data.detail,
  });
}
