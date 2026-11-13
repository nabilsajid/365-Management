import type { Field } from './types';

/** The personal profile form: the same fields at first sign-in, on My Profile and when an admin edits someone. */
export const PROFILE_FIELDS: Field[] = [
  { name: 'full_name', label: 'Full name', required: true, placeholder: 'As it should appear to the team' },
  { name: 'nickname', label: 'Nickname', placeholder: 'What people call you' },
  { name: 'contact', label: 'Contact number', required: true, placeholder: '01700000000', hint: '11 digits starting with 01. Your colleagues can see this number.' },
  { name: 'secondary_contact', label: 'Secondary contact', placeholder: '01800000000', hint: '11 digits starting with 01. Only you and the admins can see this.' },
  { name: 'address', label: 'Address', type: 'textarea', placeholder: 'House, road, area, city', hint: 'Only you and the admins can see this.' },
];
