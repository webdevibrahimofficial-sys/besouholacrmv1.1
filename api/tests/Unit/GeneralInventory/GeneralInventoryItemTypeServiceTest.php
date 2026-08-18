<?php

namespace Tests\Unit\GeneralInventory;

use App\Services\GeneralInventory\GeneralInventoryItemTypeService;
use Tests\TestCase;

class GeneralInventoryItemTypeServiceTest extends TestCase
{
    public function test_it_canonicalizes_category_types_to_products_or_services(): void
    {
        $service = new GeneralInventoryItemTypeService();

        $this->assertSame('Products', $service->normalizeCategoryType('Product'));
        $this->assertSame('Products', $service->normalizeCategoryType('products'));
        $this->assertSame('Services', $service->normalizeCategoryType('Service'));
        $this->assertSame('Services', $service->normalizeCategoryType('Package'));
        $this->assertSame('Services', $service->normalizeCategoryType('Subscription'));
        $this->assertNull($service->normalizeCategoryType('Unknown'));
        $this->assertSame('service', $service->businessTypeFromCategoryType('Services'));
        $this->assertSame('product', $service->businessTypeFromCategoryType('Products'));
    }
}
