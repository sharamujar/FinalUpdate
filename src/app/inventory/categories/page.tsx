"use client";

import { useRouter } from "next/navigation";
import { db } from "../../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, updateDoc, doc, deleteDoc, query, where } from "firebase/firestore";
import React from 'react';
import { Package, ChevronUp, ChevronDown } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    description: string;
    image?: string;
    status: 'active' | 'inactive';
    productCount: number;
    createdAt: Date;
    updatedAt: Date;
}

interface Product {
    id: string;
    name: string;
    categoryId: string;
    price: number;
    status: 'active' | 'inactive';
}

export default function Categories() {
    const [isOpen, setIsOpen] = useState(false);
    const [editCategory, setEditCategory] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [showProducts, setShowProducts] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    const [category, setCategory] = useState({
        name: "",
        description: "",
        status: "active" as const,
        image: "",
    });

    useEffect(() => {
        fetchCategories();
        fetchProducts();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
        const querySnapshot = await getDocs(collection(db, "categories"));
            const categoryList = await Promise.all(querySnapshot.docs.map(async (doc) => {
                const categoryData = doc.data();
                // Get product count for each category
                const productsQuery = query(
                    collection(db, "products"),
                    where("categoryId", "==", doc.id)
                );
                const productsSnapshot = await getDocs(productsQuery);
                
                return {
                    id: doc.id,
                    ...categoryData,
                    productCount: productsSnapshot.size,
                    createdAt: categoryData.createdAt?.toDate(),
                    updatedAt: categoryData.updatedAt?.toDate()
                };
            }));
            setCategories(categoryList as Category[]);
        } catch (error) {
            console.error("Error fetching categories:", error);
            alert("Failed to fetch categories");
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const productList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
            setProducts(productList as Product[]);
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setCategory({ ...category, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const timestamp = new Date();
            if (editCategory) {
                await updateDoc(doc(db, "categories", editCategory), {
                    ...category,
                    updatedAt: timestamp
                });
                alert("Category updated successfully!");
            } else {
                await addDoc(collection(db, "categories"), {
                    ...category,
                    createdAt: timestamp,
                    updatedAt: timestamp
                });
            alert("Category added successfully!");
            }
            setCategory({ name: "", description: "", status: "active", image: "" });
            setIsOpen(false);
            fetchCategories();
        } catch (error) {
            console.error("Error handling category:", error);
            alert("Failed to process category. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (categoryId: string) => {
        if (!categoryId) return;

        // Check if category has associated products
        const productsInCategory = products.filter(p => p.categoryId === categoryId);
        if (productsInCategory.length > 0) {
            alert(`Cannot delete category. ${productsInCategory.length} products are associated with this category.`);
            return;
        }

        const confirmation = window.confirm("Are you sure you want to delete this category?");
        if (confirmation) {
            setLoading(true);
            try {
                await deleteDoc(doc(db, "categories", categoryId));
                alert("Category deleted successfully!");
                fetchCategories();
            } catch (error) {
                console.error("Error deleting category:", error);
                alert("Failed to delete category.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleStatusChange = async (categoryId: string, newStatus: 'active' | 'inactive') => {
        setLoading(true);
        try {
            await updateDoc(doc(db, "categories", categoryId), {
                status: newStatus,
                updatedAt: new Date()
            });
            fetchCategories();
        } catch (error) {
            console.error("Error updating category status:", error);
            alert("Failed to update category status.");
        } finally {
            setLoading(false);
        }
    };

    const filteredCategories = categories
        .filter(cat => 
            (statusFilter === 'all' || cat.status === statusFilter) &&
            (cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             cat.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    return (
        <ProtectedRoute>
            <div className="flex flex-col min-h-screen bg-gray-100 p-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Category Management</h1>

                {/* Filters and Controls */}
                <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-center">
                    <input
                        type="text"
                        placeholder="Search categories..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="border p-2 rounded flex-1"
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="border p-2 rounded"
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <button
                        onClick={() => {
                            setEditCategory(null);
                            setCategory({ name: "", description: "", status: "active", image: "" });
                            setIsOpen(true);
                        }}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                        Add Category
                    </button>
                </div>

                {/* Categories Table */}
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Products</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-4">Loading categories...</td>
                                    </tr>
                                ) : filteredCategories.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-4">No categories found.</td>
                                    </tr>
                                ) : (
                                    filteredCategories.map((cat) => (
                                        <React.Fragment key={cat.id}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{cat.name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        Created: {cat.createdAt?.toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">{cat.description}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setShowProducts(showProducts === cat.id ? null : cat.id)}
                                                        className="text-blue-600 hover:text-blue-900 flex items-center gap-2 justify-center"
                                                    >
                                                        <Package className="w-4 h-4" />
                                                        {cat.productCount} Products
                                                        {showProducts === cat.id ? (
                                                            <ChevronUp className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={cat.status}
                                                        onChange={(e) => handleStatusChange(cat.id, e.target.value as 'active' | 'inactive')}
                                                        className={`px-2 py-1 rounded text-sm ${
                                                            cat.status === 'active' 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-red-100 text-red-800'
                                                        }`}
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="inactive">Inactive</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => {
                                                            setIsOpen(true);
                                                            setEditCategory(cat.id);
                                                            setCategory({
                                                                name: cat.name,
                                                                description: cat.description,
                                                                status: cat.status as "active",
                                                                image: cat.image || "",
                                                            });
                                                        }}
                                                        className="text-blue-600 hover:text-blue-900 mr-3"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(cat.id)}
                                                        className="text-red-600 hover:text-red-900"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                            {showProducts === cat.id && (
                                                <tr key={`${cat.id}-products`}>
                                                    <td colSpan={5} className="px-6 py-4 bg-gray-50">
                                                        <div className="text-sm">
                                                            <h4 className="font-medium mb-2">Products in {cat.name}</h4>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                {products
                                                                    .filter(p => p.categoryId === cat.id)
                                                                    .map(product => (
                                                                        <div key={product.id} className="flex justify-between items-center p-2 bg-white rounded shadow">
                                                                            <span>{product.name}</span>
                                                                            <span>₱{product.price}</span>
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Category Form Modal */}
                {isOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg max-w-md w-full">
                            <div className="p-6">
                                <h2 className="text-xl font-semibold mb-4">
                                    {editCategory ? 'Edit Category' : 'Add New Category'}
                                </h2>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={category.name}
                                        onChange={handleChange}
                                        required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        name="description"
                                        value={category.description}
                                        onChange={handleChange}
                                        required
                                            rows={3}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Status</label>
                                        <select
                                            name="status"
                                            value={category.status}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Image URL</label>
                                        <input
                                            type="text"
                                            name="image"
                                            value={category.image}
                                            onChange={handleChange}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsOpen(false)}
                                            className="flex-1 bg-gray-100 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-blue-300"
                                        >
                                            {loading ? 'Processing...' : (editCategory ? 'Update' : 'Add')}
                                        </button>
                                    </div>
                                </form>
                            </div>
                            </div>
                        </div>
                    )}
            </div>
        </ProtectedRoute>
    );
}
