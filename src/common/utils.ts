import { Types } from 'mongoose';

export function getIdString(id: any): string {
  if (id instanceof Types.ObjectId) {
    return id.toString();
  }
  if (typeof id === 'string') {
    return id;
  }
  if (id && id._id) {
    return getIdString(id._id);
  }
  if (id && typeof id.toString === 'function') {
    return id.toString();
  }
  return String(id);
}

export function assertId(id: any): Types.ObjectId {
  if (id instanceof Types.ObjectId) {
    return id;
  }
  if (typeof id === 'string') {
    return new Types.ObjectId(id);
  }
  throw new Error('Invalid id format');
}
