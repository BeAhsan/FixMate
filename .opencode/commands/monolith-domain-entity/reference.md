# Monolith domain entity — reference

## Paths

| Layer | Path under domain |
|-------|-------------------|
| Entity | `Model/{Name}Entity.php` |
| Repository | `Repository/{Name}RepositoryInterface.php` |
| Infrastructure | `Infrastructure/{Name}Repository.php` |
| Service | `Service/{Name}Service.php` |
| Facade | `Presentation/{Name}Facade.php` |
| Outbound DTO | `Presentation/Dto/{Name}Dto.php` |
| Service DTO | `Model/Dto/{Name}Dto.php` or `{Name}RequestDto.php` |

Namespace root: `App\Backend\Domain\{Domain}\` (plus `SubDomain\{Sub}\` when used).

## Table naming

`{domain_snake}_{entity_snake}` — grep siblings in `Model/` for the domain’s table prefix style.

## Repository (Infrastructure)

```php
/**
 * @extends ServiceEntityRepository<{Name}Entity>
 */
final class {Name}Repository extends ServiceEntityRepository implements {Name}RepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, {Name}Entity::class);
    }

    public function save({Name}Entity $entity): void
    {
        $this->getEntityManager()->persist($entity);
        $this->getEntityManager()->flush();
    }
}
```

## Service (entity-centric)

Follow `ContractApiLogService`: repository in constructor, create/persist entity, return entity or domain types.

```php
final readonly class {Name}Service
{
    public function __construct(
        private {Name}RepositoryInterface $repository,
    ) {}

    public function create({Name}ModelDto $dto): {Name}Entity
    {
        $entity = new {Name}Entity(/* from $dto */);
        $this->repository->save($entity);
        return $entity;
    }
}
```

## Facade

Follow `ContractApiLogFacade`: **only** `{Name}Service` in constructor; map to `Presentation\Dto\{Name}Dto`.

```php
final readonly class {Name}Facade implements {Name}FacadeInterface
{
    public function __construct(
        private {Name}Service $service,
    ) {}

    public function findSomething(/* Presentation or VO args */): {Name}Dto
    {
        $entity = /* call service */;
        return new {Name}Dto(/* from $entity */);
    }
}
```

## Layer rules (strict)

| Layer | May use |
|-------|---------|
| Service | `Model/*`, `Repository/*`, other `Service/*` in domain |
| Facade | `Service/*`, `Presentation/Dto/*`, map to/from `Model/Dto` |
| Facade | Must **not** use `Repository` directly (default) |
| Service | Must **not** use `Presentation/Dto` |

## services.yaml snippets

```yaml
    App\Backend\Domain\{Domain}\Repository\{Name}RepositoryInterface: '@App\Backend\Domain\{Domain}\Infrastructure\{Name}Repository'
    App\Backend\Domain\{Domain}\Presentation\{Name}FacadeInterface: '@App\Backend\Domain\{Domain}\Presentation\{Name}Facade'
```

## Canonical example in repo

`deployables/monolith/src/Backend/Domain/InsurerIntegration/`:

- `Model/ContractApiLogEntity.php`
- `Repository/ContractApiLogRepositoryInterface.php`
- `Infrastructure/ContractApiLogRepository.php`
- `Model/Dto/ContractApiLogDto.php` (service input)
- `Service/ContractApiLogService.php`
- `Presentation/ContractApiLogFacade.php` + `ContractApiLogFacadeInterface.php`
- `Presentation/Dto/ContractApiLogDto.php` (outbound)
