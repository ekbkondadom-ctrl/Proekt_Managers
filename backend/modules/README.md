# Backend modular monolith

This directory is the migration target for business modules. Existing routes can
move here gradually without a full rewrite.

Recommended module layout:

```text
modules/
  access/
    domain/
    application/
    infrastructure/
    http/
  projects/
  users/
  quotes/
  estimates/
  media/
```

Rules of thumb:

- `domain` contains business rules and policies.
- `application` contains use cases.
- `infrastructure` contains database, file storage, Excel, auth adapters.
- `http` contains Express controllers/routes.
- Existing `backend/routes` files should become thin adapters over modules.
