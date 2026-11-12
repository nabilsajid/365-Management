# Points and bonuses

## Rules

| Rule | Default | Where it is set |
| --- | --- | --- |
| Monthly target | 1,500 points | `point_settings.monthly_target` |
| Office attendance | +100 per verified day | `point_settings.attendance_points` |
| Completed task | Configurable, default 0 | `point_settings.default_task_points`, or `tasks.points_value` for one task |
| Responsibility violation | Configurable deduction | `violation_types.deduction_points` |
| Bonus | ৳1,000 for every full 1,000 points above the target | `point_settings.bonus_step_points`, `point_settings.bonus_step_amount` |

An admin can change all of these on the Employees & Rewards page. Changes apply to points awarded afterwards.

## Monthly reset

Points are not stored as a running balance. Every change is an entry in `point_entries` tagged with its month, and a month's total is the sum of that month's entries.

- On the first day of a month there are no entries for it yet, so everyone starts at zero. Nothing has to run for this to happen.
- Earlier months keep their entries, deductions and bonuses, and can be viewed with the month picker.
- Points do not carry over. Whatever is left after the bonus calculation expires with the month.
- Month boundaries follow the organization's timezone (Asia/Dhaka by default).

## Bonus calculation

```
points above target = total − monthly target
bonus = floor(points above target ÷ 1,000) × ৳1,000     (0 if below one full step)
```

| Month total | Bonus |
| --- | --- |
| 1,500 | ৳0 |
| 2,499 | ৳0 |
| 2,500 | ৳1,000 |
| 3,499 | ৳1,000 |
| 3,500 | ৳2,000 |

## Approval

- After a month has ended, an admin runs "Calculate bonuses" for it. This creates a `pending` bonus for each employee who qualifies.
- A bonus counts only once an admin sets it to `approved`. It can also be `rejected`.
- Running the calculation again refreshes pending bonuses and leaves approved and rejected ones untouched.
- Bonuses cannot be calculated for the current month, because its totals can still change.

## Deductions

- A deduction is a negative point entry with source `violation`. A written reason is required.
- Deductions only reduce points. Nothing in the system reduces salary.
- Admins can also record a manual `adjustment`, positive or negative, with a reason.
