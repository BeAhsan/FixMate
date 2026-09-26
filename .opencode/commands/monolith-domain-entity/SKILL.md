---
name: monolith-domain-entity
description: >-
  Scaffolds a new Backend Domain entity in deployables/monolith: Model entity,
  Repository interface, Infrastructure repository, Service, and Presentation Facade
  with DTOs. Prompts for target domain (or SubDomain) before generating files. Use when
  creating a domain entity, Doctrine persistence, repository, service, or facade in the monolith.
---

# Monolith domain entity

Creates a **persisted** domain slice under `deployables/monolith/src/Backend/Domain/`:

| Piece | Directory | File pattern |
|-------|-----------|--------------|
| Entity | `Model/` | `{Name}Entity.php` |
| Repository contract | `Repository/` | `{Name}RepositoryInterface.php` |
| Repository implementation | `Infrastructure/` | `{Name}Repository.php` |
| Service | `Service/` | `{Name}Service.php` (+ optional `{Name}ServiceInterface.php`) |
| Facade | `Presentation/` | `{Name}Facade.php` (+ `{Name}FacadeInterface.php` when needed) |
| Outbound DTO | `Presentation/Dto/` | `{Name}Dto.php` (and request DTOs as needed) |
| Service input DTO | `Model/Dto/` | Only when Service needs structured input (not Presentation DTOs) |

Reference implementation: `InsurerIntegration` → `ContractApiLog*` (entity, repo, service, facade).

Architecture: `.cursor/rules/domain-structure.mdc`, `.cursor/rules/architecture.mdc`, `deployables/monolith/README.md`. UUID PKs: `.cursor/rules/entity-uuid.mdc`.

Templates: [reference.md](reference.md).

## Workflow (execute in order)

### 1. Resolve target domain

```bash
ls -1 deployables/monolith/src/Backend/Domain
```

Use **AskQuestion** (or chat) for:

1. **Domain** — folder under `Backend/Domain/` (e.g. `Order`, `InsurerIntegration`).
2. **SubDomain** (optional) — `{Domain}/SubDomain/{SubDomain}/` when appropriate.

Record **base path** and **namespace** (`App\Backend\Domain\{Domain}\` or with `SubDomain\{SubDomain}\`).

### 2. Collect entity and API details

| Input | Rules |
|-------|--------|
| **Entity base name** | PascalCase without `Entity` suffix → `{Name}Entity`. |
| **Persistence** | Default: Doctrine ORM. Plain readonly models: `Model/` only unless user wants repos. |
| **Primary key** | `int` auto-increment or UUID (`entity-uuid.mdc`; `$id` last). |
| **Table name** | `{domain_snake}_{entity_snake}` — see below. |
| **Repository methods** | At least `save`. Add `find*` / queries the Service needs. |
| **Service operations** | Business methods (create, update, queries). Service uses **repository + Model/Dto** only. |
| **Facade operations** | What other domains/BFF may call. Facade delegates to **Service**, maps **Presentation/Dto** ↔ entity/Model Dto. |
| **Facade interface** | Add `{Name}FacadeInterface` when other domains will depend on the facade (grep siblings; register in `services.yaml`). |

### Table names

`{domain_snake}_{entity_snake}`:

- **domain_snake** — top-level Domain folder (`Order` → `order`)
- **entity_snake** — base name without `Entity` (`WishlistItem` → `wishlist_item`)

Examples: `order_claim`, `comparison_wishlist_item`, `insurer_integration_contract_api_log` (match prefix used in that domain — grep `#[ORM\Table]`).

### 3. Review siblings

Before writing, read a similar stack in the same domain (entity + repository + service + facade). Match:

- `final readonly`, interfaces, `TimestampableTrait`, `repositoryClass` on entity
- Whether Service has a separate interface
- Facade naming: `{Name}Facade` vs aggregate `{Domain}Facade` (prefer entity-aligned name when the slice is entity-centric, e.g. `ContractApiLogFacade`)

### 4. Create persistence layer

**Model** — `Model/{Name}Entity.php` with `#[ORM\Table(name: '...')]`.

**Repository** — `Repository/{Name}RepositoryInterface.php`.

**Infrastructure** — `{Name}Repository` extends `ServiceEntityRepository`, implements interface.

### 5. Create Service

**`Service/{Name}Service.php`**

- Inject `{Name}RepositoryInterface` (and other domain repos/services only within same domain rules).
- Implement use cases: load/save entity, validation, domain exceptions from `Model/Exception/`.
- Signatures use `{Name}Entity`, scalars, value objects, and **`Model/Dto/*`** — never `Presentation\Dto`.

Add **`{Name}ServiceInterface.php`** only if other classes in this domain mock/bind an interface for this service (pattern in `AliasEmail`, `QuoteListServiceInterface`). Otherwise concrete service is fine (`ContractApiLogService`, `WishlistItemService`).

### 6. Create Facade and Presentation DTOs

**`Presentation/Dto/{Name}Dto.php`** — data leaving the domain (readonly promoted properties).

**`Presentation/{Name}Facade.php`**

- Inject `{Name}Service` (not repository directly unless existing facades in domain do — default: **service only**).
- Public methods match the agreed facade API.
- Map entities to `Presentation\Dto\{Name}Dto` (`fromEntity`, private mapper, or `GeneralMapper` if domain already uses it).
- Map inbound Presentation request DTOs → `Model/Dto` before calling Service.

**`Presentation/{Name}FacadeInterface.php`** — mirror public facade methods; use when cross-domain or BFF depends on abstraction.

Do **not** expose `{Name}Entity` from facade methods.

### 7. Wire configuration

**`config/packages/doctrine.yaml`** — ensure domain `Model` path is mapped.

**`config/services.yaml`**

- Repository alias: `...\Repository\{Name}RepositoryInterface: '@...\Infrastructure\{Name}Repository'`
- Facade alias when interface exists, e.g. `ContractApiLogFacadeInterface` → `ContractApiLogFacade` (place with other domain facade bindings).

### 8. Migration and verification

```bash
cd deployables/monolith && bin/console doctrine:migrations:diff
```

Review migration table name. Optionally `composer phpstan -- --no-progress`.

### 9. Report back

List files, config changes, service/facade methods, and follow-ups (tests, PHPArkitect).

## Checklist

```
- [ ] Domain / SubDomain chosen
- [ ] Sibling stack reviewed
- [ ] Model/{Name}Entity.php
- [ ] Repository/{Name}RepositoryInterface.php
- [ ] Infrastructure/{Name}Repository.php
- [ ] Service/{Name}Service.php (+ interface if required)
- [ ] Model/Dto/* (if Service needs inputs)
- [ ] Presentation/Dto/{Name}Dto.php (+ request DTOs)
- [ ] Presentation/{Name}Facade.php (+ FacadeInterface if required)
- [ ] doctrine.yaml / services.yaml
- [ ] Migration reviewed
```

## Out of scope (unless user asks)

- Bff controllers / use cases
- Cross-domain repositories that call another domain’s facade
- Integration tests
