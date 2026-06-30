<?php

namespace App\Http\Controllers;

use App\Models\TaskCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskCategoryController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $query = TaskCategory::query()->orderBy('display_order')->orderBy('name');

        if (!$request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        return response()->json([
            'categories' => $query->get(),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $model = new TaskCategory();
        $table = $model->getConnectionName() . '.' . $model->getTable();

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9_-]+$/', Rule::unique($table, 'code')],
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'display_order' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $category = TaskCategory::create([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'display_order' => $validated['display_order'] ?? 0,
            'is_active' => $request->boolean('is_active', true),
        ]);

        return response()->json([
            'message' => 'Task category created successfully.',
            'category' => $category,
        ], 201);
    }

    public function update(Request $request, TaskCategory $taskCategory)
    {
        $this->authorizeSuperAdmin($request);

        $table = $taskCategory->getConnectionName() . '.' . $taskCategory->getTable();

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                'regex:/^[a-z0-9_-]+$/',
                Rule::unique($table, 'code')->ignore($taskCategory->id),
            ],
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'display_order' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $taskCategory->update([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'display_order' => $validated['display_order'] ?? $taskCategory->display_order,
            'is_active' => $request->boolean('is_active', $taskCategory->is_active),
        ]);

        return response()->json([
            'message' => 'Task category updated successfully.',
            'category' => $taskCategory->fresh(),
        ]);
    }

    public function destroy(Request $request, TaskCategory $taskCategory)
    {
        $this->authorizeSuperAdmin($request);

        $taskCategory->delete();

        return response()->json([
            'message' => 'Task category deleted successfully.',
        ]);
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }
}
