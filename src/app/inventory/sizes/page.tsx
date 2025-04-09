"use client";

import { useRouter } from "next/navigation";
import { db, storage } from "../../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface Size {
    id: string;
    name: string;
    dimensions: string;
    slices: number;
    shape: string;
    price: number;
    maxVarieties: number;
    imageUrl: string;
    varieties: string[];
}

export default function Sizes() {
    const [isOpenSize, setIsOpenSize] = useState(false);
    const [editSize, setEditSize] = useState<string | null>(null);

    const [sizes, setSizes] = useState<Size[]>([]);

    const [size, setSize] = useState<Omit<Size, 'id'>>({
        name: "",
        dimensions: "",
        slices: 0,
        shape: "",
        price: 0,
        maxVarieties: 0,
        imageUrl: "",
        varieties: [],
    });

    const [image, setImage] = useState<File | null>(null);

    const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
        setSize({ ...size, [e.target.name]: value });
    };

    useEffect(() => {
        fetchSizes();
    }, []);

    const fetchSizes = async () => {
        const querySnapshot = await getDocs(collection(db, "sizes"));
        const sizeList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            varieties: doc.data().varieties || []
        }));
        setSizes(sizeList as Size[]);
    };

    const uploadImage = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "bbnka-product-images"); // asset folder name
        formData.append("cloud_name", "dbmofuvwn"); // Cloudinary cloud name

        try {
            const res = await fetch("https://api.cloudinary.com/v1_1/dbmofuvwn/image/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            return data.secure_url; // get the uploaded image URL

        } catch (error) {
            console.error("Error uploading image: ", error);
            return null;
        }
    };

    const handleSizeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let imageUrl = "";
            if (image) {
                imageUrl = await uploadImage(image);
            }

            const sizeData = {
                ...size,
                price: Number(size.price) || 0,
                slices: Number(size.slices) || 0,
                maxVarieties: Number(size.maxVarieties) || 1,
                imageUrl,
            };

            if (editSize) {
                await updateDoc(doc(db, "sizes", editSize), sizeData);
                alert("Size updated successfully!");
            } else {
                await addDoc(collection(db, "sizes"), sizeData);
                alert("Size added successfully!");
            }
            setSize({
                name: "",
                dimensions: "",
                slices: 0,
                shape: "",
                price: 0,
                maxVarieties: 0,
                imageUrl: "",
                varieties: [],
            });
            setImage(null);
            setIsOpenSize(false);
            fetchSizes();
        } catch (error) {
            console.error("Error managing size: ", error);
            alert("Operation failed. Please try again later.");
        }
    };

    const handleDeleteSize = async (sizeId: string) => {
        if (!sizeId) return;

        const confirmation = window.confirm("Are you sure you want to delete this size?");
        if (confirmation) {
            try {
                await deleteDoc(doc(db, "sizes", sizeId));
                alert("Size deleted successfully!");
                fetchSizes();
            } catch (error) {
                console.error("Error deleting size: ", error);
                alert("Failed to delete size. Please try again later.");
            }
        }
    };

    return (
        <ProtectedRoute>
            <div className="flex h-screen overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6">
                        {/* Product Sizes Section */}
                        <div className="space-y-8">
                            <div className="bg-white rounded-lg shadow p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-2xl font-bold text-gray-800">Product Sizes</h2>
                                    <button
                                        onClick={() => {
                                            setEditSize(null);
                                            setSize({
                                                name: "",
                                                dimensions: "",
                                                slices: 0,
                                                shape: "",
                                                price: 0,
                                                maxVarieties: 0,
                                                imageUrl: "",
                                                varieties: [],
                                            });
                                            setIsOpenSize(true);
                                        }}
                                        className="px-4 py-2 bg-bg-light-brown text-white rounded hover:bg-opacity-90"
                                    >
                                        Add Size
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="p-4 bg-gray-50">Image</th>
                                                <th className="p-4 bg-gray-50">Name</th>
                                                <th className="p-4 bg-gray-50">Dimensions</th>
                                                <th className="p-4 bg-gray-50">Slices</th>
                                                <th className="p-4 bg-gray-50">Shape</th>
                                                <th className="p-4 bg-gray-50">Max Varieties</th>
                                                <th className="p-4 bg-gray-50">Varieties</th>
                                                <th className="p-4 bg-gray-50">Price</th>
                                                <th className="p-4 bg-gray-50">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sizes.map((size) => (
                                                <tr key={size.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-4">
                                                        {size.imageUrl && (
                                                            <img
                                                                src={size.imageUrl}
                                                                alt={size.name}
                                                                className="w-16 h-16 object-cover rounded"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="p-4">{size.name}</td>
                                                    <td className="p-4">{size.dimensions}</td>
                                                    <td className="p-4">{size.slices}</td>
                                                    <td className="p-4">{size.shape}</td>
                                                    <td className="p-4">{size.maxVarieties}</td>
                                                    <td className="p-4">{size.varieties.join(", ")}</td>
                                                    <td className="p-4">₱{(size.price || 0).toFixed(2)}</td>
                                                    <td className="p-4">
                                                        <button
                                                            onClick={() => {
                                                                setEditSize(size.id);
                                                                setSize(size);
                                                                setIsOpenSize(true);
                                                            }}
                                                            className="text-blue-600 hover:text-blue-800 mr-4"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteSize(size.id)}
                                                            className="text-red-600 hover:text-red-800"
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Modals */}
                    {isOpenSize && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 w-96">
                                <h3 className="text-xl font-bold mb-4">{editSize ? 'Edit Size' : 'Add Size'}</h3>
                                <form onSubmit={handleSizeSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Name</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={size.name}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Dimensions</label>
                                        <input
                                            type="text"
                                            name="dimensions"
                                            value={size.dimensions}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Slices</label>
                                        <input
                                            type="number"
                                            name="slices"
                                            value={size.slices}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Shape</label>
                                        <select
                                            name="shape"
                                            value={size.shape}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        >
                                            <option value="">Select shape</option>
                                            <option value="Round">Round</option>
                                            <option value="Rectangle">Rectangle</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Price</label>
                                        <input
                                            type="number"
                                            name="price"
                                            value={size.price}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Max Varieties</label>
                                        <input
                                            type="number"
                                            name="maxVarieties"
                                            value={size.maxVarieties}
                                            onChange={handleSizeChange}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Upload Image</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                if (e.target.files) {
                                                    setImage(e.target.files[0]);
                                                }
                                            }}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Varieties (comma-separated)</label>
                                        <input
                                            type="text"
                                            name="varieties"
                                            value={size.varieties.join(", ")}
                                            onChange={(e) => {
                                                const varietiesArray = e.target.value.split(",").map(v => v.trim());
                                                setSize({ ...size, varieties: varietiesArray });
                                            }}
                                            className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                                            placeholder="Enter varieties"
                                        />
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsOpenSize(false)}
                                            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 px-4 py-2 bg-bg-light-brown text-white rounded hover:bg-opacity-90"
                                        >
                                            {editSize ? 'Update' : 'Add'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
} 