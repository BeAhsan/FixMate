<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // A price is money, so it is stored as a fixed-scale decimal rather
            // than a float: a float accumulates binary rounding error across
            // repeated arithmetic, and 19.99 is not representable exactly. The
            // scale is fixed at two decimal places so the column states its own
            // precision instead of leaving it to the caller.
            //
            // The cast on the model is `decimal:2`, which returns this as a
            // *string*. That is deliberate for storage and is converted to a
            // float in exactly one place, the API resource, because the wire
            // contract requires a JSON number.
            $table->decimal('price', 10, 2);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
