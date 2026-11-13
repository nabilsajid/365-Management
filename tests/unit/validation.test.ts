import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from '../../src/lib/validation';

const UUID = '11111111-1111-1111-1111-111111111111';

test('a project needs only a name; client, links, team and deliverables are optional', () => {
  assert.equal(v.projectCreate.safeParse({ name: 'Internal reel' }).success, true);
  const parsed = v.projectCreate.safeParse({
    name: 'Launch campaign',
    client_name: 'Acme',
    brief: 'Three videos',
    file_links: [{ label: 'Brief', url: 'https://docs.google.com/document/d/1' }],
    member_ids: [UUID],
    deliverables: [
      { title: 'Video 1', description: 'Teaser', file_links: [{ label: 'Footage', url: 'https://drive.google.com/x' }] },
      { title: 'Video 2', assignee_id: UUID, points_value: 300 },
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(v.projectCreate.safeParse({ name: '  ' }).success, false);
  assert.equal(v.projectCreate.safeParse({ name: 'X', member_ids: ['not-an-id'] }).success, false);
  assert.equal(v.projectCreate.safeParse({ name: 'X', file_links: [{ label: 'Bad', url: 'ftp://x' }] }).success, false);
});

test('project input rejects an untitled deliverable and drops unknown equipment fields', () => {
  assert.equal(v.projectCreate.safeParse({ name: 'X', deliverables: [{ title: ' ' }] }).success, false);

  const parsed = v.projectCreate.parse({ name: 'X', equipment_ids: [UUID] });
  assert.ok(!('equipment_ids' in parsed));
  assert.deepEqual(parsed.deliverables, []);
});

test('submissions accept Drive, Dropbox and text, and reject mismatches', () => {
  assert.equal(v.submissionCreate.safeParse({ kind: 'drive', url: 'https://drive.google.com/file/d/1' }).success, true);
  assert.equal(v.submissionCreate.safeParse({ kind: 'dropbox', url: 'https://www.dropbox.com/s/1' }).success, true);
  assert.equal(v.submissionCreate.safeParse({ kind: 'text', note: 'Done, see shared folder.' }).success, true);
  assert.equal(v.submissionCreate.safeParse({ kind: 'drive' }).success, false);
  assert.equal(v.submissionCreate.safeParse({ kind: 'text', note: '' }).success, false);
  assert.equal(v.submissionCreate.safeParse({ kind: 'dropbox', url: 'https://drive.google.com/file/d/1' }).success, false);
  assert.equal(v.submissionCreate.safeParse({ kind: 'email', note: 'x' }).success, false);
});

test('equipment can be registered without a purchase price', () => {
  assert.equal(v.equipmentCreate.safeParse({ name: 'Old tripod' }).success, true);
  assert.equal(v.equipmentCreate.safeParse({ name: 'Old tripod', purchase_price: null }).success, true);
  assert.equal(v.equipmentCreate.safeParse({ name: 'Old tripod', purchase_price: -5 }).success, false);
});

test('an equipment purchase may omit the amount; other expenses may not', () => {
  assert.equal(v.expenseCreate.safeParse({ category: 'equipment', description: 'Sony FX3' }).success, true);
  assert.equal(v.expenseCreate.safeParse({ category: 'equipment', description: 'Sony FX3', amount: null }).success, true);
  assert.equal(v.expenseCreate.safeParse({ category: 'general', description: 'Paper' }).success, false);
  assert.equal(v.expenseCreate.safeParse({ description: 'Paper', amount: 600 }).success, true);
});

test('a transport expense needs both ends of the trip', () => {
  const trip = { category: 'transport', description: 'Client shoot', amount: 400 };
  assert.equal(v.expenseCreate.safeParse(trip).success, false);
  assert.equal(v.expenseCreate.safeParse({ ...trip, trip_origin: 'Office' }).success, false);
  assert.equal(v.expenseCreate.safeParse({ ...trip, trip_origin: 'Office', trip_destination: 'Gulshan' }).success, true);
});

test('a fixed-cost link is only allowed on a fixed expense', () => {
  const base = { description: 'November rent', amount: 30000, fixed_expense_id: UUID };
  assert.equal(v.expenseCreate.safeParse({ ...base, category: 'fixed' }).success, true);
  assert.equal(v.expenseCreate.safeParse({ ...base, category: 'general' }).success, false);
});

test('invoices and payments need positive amounts', () => {
  assert.equal(v.invoiceCreate.safeParse({ client_id: UUID, invoice_number: 'INV-1', amount: 50000 }).success, true);
  assert.equal(v.invoiceCreate.safeParse({ client_id: UUID, invoice_number: 'INV-1', amount: 0 }).success, false);
  assert.equal(v.paymentCreate.safeParse({ invoice_id: UUID, account_id: UUID, amount: -1 }).success, false);
});

test('a deduction must be documented and tied to a type or a number of points', () => {
  const base = { source: 'violation', employee_id: UUID };
  assert.equal(v.pointEntryCreate.safeParse({ ...base, violation_type_id: UUID, reason: 'Missed deadline' }).success, true);
  assert.equal(v.pointEntryCreate.safeParse({ ...base, points: 50, reason: 'Late to shoot' }).success, true);
  assert.equal(v.pointEntryCreate.safeParse({ ...base, violation_type_id: UUID, reason: '  ' }).success, false);
  assert.equal(v.pointEntryCreate.safeParse({ ...base, reason: 'No type or points' }).success, false);
});

test('an adjustment needs non-zero points and a reason', () => {
  const base = { source: 'adjustment', employee_id: UUID, reason: 'Correction' };
  assert.equal(v.pointEntryCreate.safeParse({ ...base, points: -200 }).success, true);
  assert.equal(v.pointEntryCreate.safeParse({ ...base, points: 0 }).success, false);
  assert.equal(v.pointEntryCreate.safeParse({ ...base }).success, false);
});

test('point rules stay sensible', () => {
  assert.equal(v.pointSettingsUpdate.safeParse({ monthly_target: 1500, default_task_points: 250 }).success, true);
  assert.equal(v.pointSettingsUpdate.safeParse({ bonus_step_points: 0 }).success, false);
  assert.equal(v.pointSettingsUpdate.safeParse({ attendance_points: -100 }).success, false);
});

test('bonus decisions and months are constrained', () => {
  assert.equal(v.bonusDecision.safeParse({ status: 'approved' }).success, true);
  assert.equal(v.bonusDecision.safeParse({ status: 'paid' }).success, false);
  assert.equal(v.bonusCalculate.safeParse({ month: '2026-10' }).success, true);
  assert.equal(v.bonusCalculate.safeParse({ month: 'October' }).success, false);
});

test('attendance needs a real date', () => {
  assert.equal(v.attendanceCreate.safeParse({ work_date: '2026-11-12' }).success, true);
  assert.equal(v.attendanceCreate.safeParse({ work_date: '12/11/2026' }).success, false);
});

test('attendance times are clock times and the exit comes after the entry', () => {
  const day = { work_date: '2026-11-12' };
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '10:00', check_out: '18:30' }).success, true);
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '10:00:00', check_out: '18:30:00' }).success, true);
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '18:00', check_out: '09:00' }).success, false);
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '10:00', check_out: '10:00' }).success, false);
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '25:00', check_out: '26:00' }).success, false);
  assert.equal(v.attendanceCreate.safeParse({ ...day, check_in: '10am', check_out: '6pm' }).success, false);
  assert.equal(v.attendanceUpdate.safeParse({ check_in: '09:00', check_out: '08:00' }).success, false);
  assert.equal(v.attendanceUpdate.safeParse({ check_out: null }).success, true);
});

test('a broadcast is a short, non-empty message', () => {
  assert.equal(v.broadcastCreate.safeParse({ message: 'Editing PC will not start' }).success, true);
  assert.equal(v.broadcastCreate.safeParse({ message: '   ' }).success, false);
  assert.equal(v.broadcastCreate.safeParse({ message: 'x'.repeat(280) }).success, true);
  assert.equal(v.broadcastCreate.safeParse({ message: 'x'.repeat(281) }).success, false);
  assert.equal(v.broadcastUpdate.safeParse({ status: 'resolved' }).success, true);
  assert.equal(v.broadcastUpdate.safeParse({ status: 'deleted' }).success, false);
});

test('equipment condition is perfect, moderate, weak or not set', () => {
  for (const condition of ['perfect', 'moderate', 'weak', null]) {
    assert.equal(v.equipmentCreate.safeParse({ name: 'Tripod', condition }).success, true, String(condition));
  }
  assert.equal(v.equipmentCreate.safeParse({ name: 'Tripod', condition: 'broken' }).success, false);
});

test('a needed item has a name and a whole positive quantity', () => {
  assert.equal(v.equipmentNeedCreate.parse({ item_name: 'Camera battery' }).quantity, 1);
  assert.equal(v.equipmentNeedCreate.safeParse({ item_name: 'Tripod', quantity: 2, note: 'For Friday' }).success, true);
  assert.equal(v.equipmentNeedCreate.safeParse({ item_name: '', quantity: 1 }).success, false);
  assert.equal(v.equipmentNeedCreate.safeParse({ item_name: 'Tripod', quantity: 0 }).success, false);
  assert.equal(v.equipmentNeedUpdate.safeParse({ status: 'acquired' }).success, true);
});

test('a password request needs a real email, compared without regard to case', () => {
  assert.equal(v.passwordRequestCreate.parse({ email: '  Rafi@Example.com ' }).email, 'rafi@example.com');
  assert.equal(v.passwordRequestCreate.safeParse({ email: 'not-an-email' }).success, false);
  assert.equal(v.passwordRequestCreate.safeParse({}).success, false);
});

test('an admin either sets a long-enough password or dismisses the request', () => {
  assert.equal(v.passwordRequestResolve.safeParse({ action: 'set', password: 'secret1' }).success, true);
  assert.equal(v.passwordRequestResolve.safeParse({ action: 'set', password: '12345' }).success, false);
  assert.equal(v.passwordRequestResolve.safeParse({ action: 'set' }).success, false);
  assert.equal(v.passwordRequestResolve.safeParse({ action: 'dismiss' }).success, true);
  assert.equal(v.passwordRequestResolve.safeParse({ action: 'email' }).success, false);
});
