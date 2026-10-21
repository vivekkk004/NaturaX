# Sample data

## `orders_with_errors_demo.csv` – one example of every validation case

Upload as a manager (UI "Import" page, or `POST /api/imports`). Expected result:

| Row   | Order ID  | What is planted                                      | Outcome                                 |
| ----- | --------- | ---------------------------------------------------- | --------------------------------------- |
| 2     | DEMO-1001 | clean confirmed order                                | imported                                |
| 3     | DEMO-1002 | `₹7,499`, `+91` phone, "In Transit", matched by name | imported (normalised)                   |
| 4     | DEMO-1003 | failed delivery                                      | imported                                |
| 5     | DEMO-1004 | "Pending" (= unconfirmed)                            | imported                                |
| 6     | DEMO-1005 | order date 31-02-2026                                | needs correction – INVALID_DATE         |
| 7     | DEMO-1006 | customer name missing                                | needs correction – MISSING_FIELD        |
| 8     | DEMO-1007 | phone `12345`                                        | needs correction – INVALID_PHONE        |
| 9     | DEMO-1008 | order value `abc`                                    | needs correction – INVALID_AMOUNT       |
| 10    | DEMO-1009 | payment type "UPI Later"                             | needs correction – INVALID_PAYMENT_TYPE |
| 11    | DEMO-1010 | shipped but no dispatch / expected delivery date     | needs correction – MISSING_FIELD ×2     |
| 12    | DEMO-1011 | dispatched before it was ordered                     | needs correction – DATE_SEQUENCE        |
| 13    | DEMO-1012 | status Confirmed but has a dispatch date             | needs correction – STATUS_DATE_CONFLICT |
| 14    | DEMO-1013 | unknown status "Lost in transit"                     | needs correction – INVALID_STATUS       |
| 15–16 | DEMO-1014 | same ID twice with **different** data                | both rejected – DUPLICATE_IN_FILE       |
| 17–18 | DEMO-1015 | same ID twice with **identical** data                | first imported, second skipped          |
| 19    | (blank)   | no Order ID                                          | rejected – MISSING_FIELD                |
| 20    | DEMO-1016 | employee `EMP999` does not exist                     | imported, warning, task unassigned      |
| 21    | DEMO-1017 | order date in 2030                                   | needs correction – FUTURE_DATE          |

Uploading the same file a second time reports every stored order as **unchanged** – no duplicates.

The full generated dataset (100+ orders, CSV + XLSX) is added in Part 9.
