"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, updateDoc, doc, deleteDoc, query, orderBy, where, limit } from "firebase/firestore";
import { db } from "../../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Stock {
    id: string;
    sizeId: string;       // Reference to the size document
    sizeName: string;     // e.g., 'Big Bilao', 'Regular Tray'
    varieties: string[];  // Array of varieties selected for this stock
    quantity: number;
    minimumStock: number;
    reorderPoint: number;
    productionDate: string;
    expiryDate: string;
    lastUpdated: Date;
    remarks: string;
}

interface StockHistory {
    id: string;
    varieties: string[];  // Change from variety to varieties array
    sizeName: string;    // Changed from productName to sizeName
    type: 'in' | 'out' | 'adjustment' | 'deleted';
    quantity: number;
    previousQuantity: number;
    newQuantity: number;
    date: Date;
    updatedBy: string;
    remarks: string;
    stockId: string;
    isDeleted: boolean;
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor?: string;
    tension: number;
  }[];
}

interface Size {
    id: string;
    name: string;          // e.g., "Big Bilao"
    price: number;         // Price based on size
    maxVarieties: number;  // Maximum number of varieties allowed
    availableVarieties?: string[]; // Specific varieties allowed (if applicable)
    boxPrice?: number;     // Additional price for box (optional)
}

// Define available varieties
// const VARIETIES = [ ... ];

const sizes: Size[] = [
    { id: '1', name: 'Big Bilao', price: 520.00, maxVarieties: 4 },
    { id: '2', name: 'Tray', price: 420.00, maxVarieties: 4 },
    { id: '3', name: 'Small', price: 280.00, maxVarieties: 1, availableVarieties: ['Bibingka'] },
    { id: '4', name: 'Half Tray', price: 240.00, maxVarieties: 2 },
    { id: '5', name: 'Solo', price: 200.00, maxVarieties: 1, availableVarieties: ['Bibingka'] },
    { id: '6', name: '1/4 Slice', price: 120.00, maxVarieties: 0, boxPrice: 140.00 } // No box price
];

export default function Stock() {
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [stockHistory, setStockHistory] = useState<StockHistory[]>([]);
    const [stock, setStock] = useState<Stock>({
        id: '',
        sizeId: "",
        sizeName: "",
        varieties: [],
        quantity: 0,
        minimumStock: 0,
        reorderPoint: 0,
        productionDate: "",
        expiryDate: "",
        lastUpdated: new Date(),
        remarks: ""
    });
    const [editStockId, setEditStockId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [stockChartData, setStockChartData] = useState<ChartData>({
        labels: [],
        datasets: [{
            label: 'Stock Level',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1
        }]
    });
    const [filterCategory, setFilterCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showLowStock, setShowLowStock] = useState(false);
    const [sizes, setSizes] = useState<Size[]>([]);
    const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
    const [isAddSizeOrVarietyOpen, setIsAddSizeOrVarietyOpen] = useState(false);
    const [newSizeName, setNewSizeName] = useState('');
    const [newSizePrice, setNewSizePrice] = useState('');
    const [newSizeMaxVarieties, setNewSizeMaxVarieties] = useState('1');
    const [newVarietyName, setNewVarietyName] = useState('');
    const [varieties, setVarieties] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        fetchSizes();
        fetchStocks();
        fetchStockHistory();
        fetchVarieties();
    }, []);

    const fetchStocks = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "stocks"));
            const stockList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastUpdated: doc.data().lastUpdated?.toDate() || new Date()
            })) as Stock[];
            console.log("Fetched stocks with IDs:", stockList.map(s => ({ id: s.id, name: s.sizeName })));
            setStocks(stockList);
            updateStockChart(stockList);
        } catch (error) {
            console.error("Error fetching stocks:", error);
        }
    };

    const fetchStockHistory = async () => {
        try {
            const historyRef = collection(db, "stockHistory");
            const historyQuery = query(
                historyRef,
                orderBy("date", "desc"),
                limit(50)
            );
            const querySnapshot = await getDocs(historyQuery);
            const historyList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date.toDate()
            })) as StockHistory[];
            
            // Filter out history entries for deleted stocks if needed
            const filteredHistory = historyList.filter(history => !history.isDeleted);
            setStockHistory(filteredHistory);
        } catch (error) {
            console.error("Error fetching stock history:", error);
        }
    };

    const fetchSizes = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "sizes"));
            const sizesList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                price: doc.data().price,
                maxVarieties: doc.data().maxVarieties
            })) as Size[];
            setSizes(sizesList);
        } catch (error) {
            console.error("Error fetching sizes:", error);
        }
    };

    const fetchVarieties = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "varieties"));
            const varietiesList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            }));
            console.log("Fetched varieties:", varietiesList);
            setVarieties(varietiesList);
        } catch (error) {
            console.error("Error fetching varieties:", error);
        }
    };

    const updateStockChart = (stockList: Stock[]) => {
        const sortedStocks = [...stockList].sort((a, b) => b.quantity - a.quantity);
        setStockChartData({
            labels: sortedStocks.map(s => s.sizeName),
            datasets: [{
                label: 'Current Stock Level',
                data: sortedStocks.map(s => s.quantity),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                tension: 0.1
            }]
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setStock(prev => ({
            ...prev,
            [name]: name === 'quantity' || name === 'price' || name === 'minimumStock' || name === 'reorderPoint' 
                ? parseFloat(value) 
                : value
        }));
    };

    const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedSize = sizes.find(s => s.id === e.target.value);
        
        // Reset selected varieties when size changes
        let autoSelectedVarieties: string[] = [];

        if (selectedSize) {
            if (selectedSize.name === 'Solo' || selectedSize.name === 'Small') {
                // For Solo and Small, automatically select Bibingka
                autoSelectedVarieties = ['Bibingka'];
            }
            // For Big Bilao, we don't auto-select any varieties
            // but we'll handle the max limit in handleVarietyChange
        }

        setStock(prev => ({
            ...prev,
            sizeId: e.target.value,
            sizeName: selectedSize?.name || '',
            varieties: autoSelectedVarieties
        }));

        setSelectedVarieties(autoSelectedVarieties);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const selectedSize = sizes.find(s => s.id === stock.sizeId);
            
            if (!selectedSize) {
                throw new Error("Selected size not found");
            }

            if (selectedVarieties.length === 0) {
                alert("Please select at least one variety");
                return;
            }

            if (selectedVarieties.length > selectedSize.maxVarieties) {
                alert(`You can only select up to ${selectedSize.maxVarieties} varieties.`);
                return;
            }

            // Check if expiry date is after production date
            const expiryDate = new Date(stock.expiryDate);
            const productionDate = new Date(stock.productionDate);
            const currentDate = new Date();

            if (expiryDate <= productionDate) {
                alert("Expiry date must be after production date");
                setLoading(false);
                return;
            }

            // Check if the stock is already expired
            if (expiryDate <= currentDate) {
                if (!confirm("Warning: This stock is already expired! Do you still want to add it?")) {
                    setLoading(false);
                    return;
                }
            }

            // Check if expiry date is approaching (within 7 days)
            const sevenDaysFromNow = new Date();
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            
            if (expiryDate <= sevenDaysFromNow) {
                alert("Warning: This stock will expire within 7 days!");
            }

            // Ensure the price is included in the stock data
            const newStockData = {
                ...stock,
                lastUpdated: new Date(),
                sizeName: selectedSize.name,
                price: selectedSize.price,
                varieties: selectedVarieties,
                id: ''
            };

            console.log("Submitting stock data:", newStockData);

            if (editStockId) {
                const stockRef = doc(db, "stocks", editStockId);
                await updateDoc(stockRef, newStockData);
                alert("Stock updated successfully!");
            } else {
                const docRef = await addDoc(collection(db, "stocks"), newStockData);
                await updateDoc(docRef, { id: docRef.id });

                await addDoc(collection(db, "stockHistory"), {
                    varieties: selectedVarieties,
                    sizeName: selectedSize.name,
                    type: 'in',
                    quantity: stock.quantity,
                    previousStock: 0,
                    currentStock: stock.quantity,
                    date: new Date(),
                    updatedBy: "Admin",
                    remarks: "Initial stock entry",
                    stockId: docRef.id,
                    isDeleted: false
                });

                alert("Stock added successfully!");
            }

            resetForm();
            await Promise.all([fetchStocks(), fetchStockHistory()]);
        } catch (error) {
            console.error("Error handling stock:", error);
            alert("Failed to process stock. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    const handleStockAdjustment = async (id: string, adjustment: number) => {
        try {
            const stockRef = doc(db, "stocks", id);
            const currentStock = stocks.find(s => s.id === id);
            
            if (!currentStock) {
                alert("Stock not found!");
                return;
            }

            const newQuantity = currentStock.quantity + adjustment;
            if (newQuantity < 0) {
                alert("Stock cannot be negative!");
                return;
            }

            const timestamp = new Date();
            
            // Update the stock quantity
            await updateDoc(stockRef, {
                quantity: newQuantity,
                lastUpdated: timestamp
            });

            // Record in history with stockId and varieties
            await addDoc(collection(db, "stockHistory"), {
                varieties: currentStock.varieties, // Include varieties in the history
                sizeName: currentStock.sizeName,
                type: adjustment > 0 ? 'in' : 'out',
                quantity: Math.abs(adjustment),
                previousStock: currentStock.quantity, // Set previous stock
                currentStock: newQuantity, // Set current stock
                date: timestamp,
                updatedBy: "Admin",
                remarks: `Stock ${adjustment > 0 ? 'added' : 'removed'}: ${Math.abs(adjustment)} units`,
                stockId: id,
                isDeleted: false
            });

            await Promise.all([fetchStocks(), fetchStockHistory()]);
            
            alert(`Stock ${adjustment > 0 ? 'added' : 'removed'} successfully!`);
        } catch (error) {
            console.error("Error adjusting stock:", error);
            alert("Failed to adjust stock. Please try again later.");
        }
    };

    const handleEdit = (stk: Stock) => {
        setEditStockId(stk.id);
        setStock(stk);
    };

    const handleDelete = async (id: string) => {
        console.log("Attempting to delete stock with ID:", id);
        
        if (!id) {
            alert("Invalid stock ID!");
            return;
        }

        if (!confirm("Are you sure you want to delete this stock?")) {
            return;
        }

        try {
            const stockRef = doc(db, "stocks", id);
            const currentStock = stocks.find(s => s.id === id);
            
            if (!currentStock) {
                alert("Stock not found!");
                return;
            }

            // Delete the stock
            await deleteDoc(stockRef);

            // Record final deletion in history
            await addDoc(collection(db, "stockHistory"), {
                variety: currentStock.varieties[0],
                sizeName: currentStock.sizeName,
                type: 'deleted',
                quantity: currentStock.quantity,
                previousQuantity: currentStock.quantity,
                newQuantity: 0,
                date: new Date(),
                updatedBy: "Admin",
                remarks: "Stock deleted",
                stockId: id,
                isDeleted: true
            });

            // Update existing history entries for this stock
            const historyQuery = query(
                collection(db, "stockHistory"),
                where("stockId", "==", id)
            );
            
            const historySnapshot = await getDocs(historyQuery);
            const updatePromises = historySnapshot.docs.map(doc => 
                updateDoc(doc.ref, { isDeleted: true })
            );
            await Promise.all(updatePromises);

            // Refresh the stocks list and history
            await Promise.all([fetchStocks(), fetchStockHistory()]);
            
                alert("Stock deleted successfully!");
            } catch (error) {
                console.error("Error deleting stock:", error);
                alert("Failed to delete stock.");
        }
    };

    const resetForm = () => {
        setStock({
            id: '',
            sizeId: "",
            sizeName: "",
            varieties: [],
            quantity: 0,
            minimumStock: 0,
            reorderPoint: 0,
            productionDate: "",
            expiryDate: "",
            lastUpdated: new Date(),
            remarks: ""
        });
        setEditStockId(null);
        setSelectedVarieties([]);
    };

    console.log("Stocks before filtering:", stocks);

    const filteredStocks = stocks
        .filter(s => filterCategory === 'all' || s.sizeName === filterCategory)
        .filter(s => showLowStock ? s.quantity <= s.minimumStock : true)
        .filter(s => 
            s.sizeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.varieties?.some(v => v.toLowerCase().includes(searchTerm.toLowerCase())) ||
            ''
        );

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: true,
                text: 'Stock Levels Overview'
            },
        },
    };

    // Update the handleVarietyChange function to handle variety selection limits
    const handleVarietyChange = (variety: string) => {
        const selectedSize = sizes.find(s => s.id === stock.sizeId);
        const maxVarieties = selectedSize?.maxVarieties || 0;

        // For Solo and Small sizes, only allow Bibingka
        if ((selectedSize?.name === 'Solo' || selectedSize?.name === 'Small') && variety !== 'Bibingka') {
            return;
        }

        // For Big Bilao, don't allow Cassava
        if (selectedSize?.name === 'Big Bilao' && variety === 'Cassava') {
            alert('Cassava is not available for Big Bilao size');
            return;
        }

        // If variety is already selected, remove it
        if (selectedVarieties.includes(variety)) {
            setSelectedVarieties(prev => prev.filter(v => v !== variety));
        } else {
            // If under max limit, add the variety
            if (selectedVarieties.length < maxVarieties) {
                setSelectedVarieties(prev => [...prev, variety]);
            } else {
                alert(`You can only select up to ${maxVarieties} varieties.`);
            }
        }
    };

    const handleAddSizeOrVariety = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Add new size to Firestore
            if (newSizeName && newSizePrice) {
                await addDoc(collection(db, "sizes"), {
                    name: newSizeName,
                    price: parseFloat(newSizePrice),
                    maxVarieties: parseInt(newSizeMaxVarieties),
                    createdAt: new Date()
                });
                setNewSizeName('');
                setNewSizePrice('');
                setNewSizeMaxVarieties('1');
            }

            // Add new variety to Firestore
            if (newVarietyName) {
                await addDoc(collection(db, "varieties"), {
                    name: newVarietyName,
                    createdAt: new Date()
                });
                setNewVarietyName('');
            }

            // Refresh the sizes and varieties
            await fetchSizes(); // Refresh sizes
            await fetchVarieties(); // Refresh varieties

            alert("Successfully added new size/variety!");
            setIsAddSizeOrVarietyOpen(false);
        } catch (error) {
            console.error("Error adding size/variety:", error);
            alert("Failed to add size/variety");
        }
    };

    // Add these functions to handle deletion
    const handleDeleteSize = async (sizeId: string) => {
        if (!confirm('Are you sure you want to delete this size?')) return;
        try {
            await deleteDoc(doc(db, "sizes", sizeId));
            await fetchSizes();
            alert('Size deleted successfully!');
        } catch (error) {
            console.error("Error deleting size:", error);
            alert('Failed to delete size');
        }
    };

    const handleDeleteVariety = async (varietyId: string) => {
        if (!confirm('Are you sure you want to delete this variety?')) return;
        try {
            await deleteDoc(doc(db, "varieties", varietyId));
            await fetchVarieties();
            alert('Variety deleted successfully!');
        } catch (error) {
            console.error("Error deleting variety:", error);
            alert('Failed to delete variety');
        }
    };

    // Add this helper function at the top of your component
    const getExpiryStatus = (expiryDate: string) => {
        const expiry = new Date(expiryDate);
        const today = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 3);

        if (expiry <= today) {
            return { status: 'Expired', className: 'bg-red-100 text-red-800' };
        } else if (expiry <= sevenDaysFromNow) {
            return { status: 'Expiring Soon', className: 'bg-yellow-100 text-yellow-800' };
        }
        return { status: 'Valid', className: 'bg-green-100 text-green-800' };
    };

    return (
        <ProtectedRoute>
            <div className="flex h-screen overflow-hidden">
                {/* Sidebar will be rendered here by the layout */}
                <div className="flex-1 overflow-y-auto bg-gray-100">
                    <div className="p-6">
                        <h1 className="text-3xl font-bold text-gray-800 mb-6">Stock Management</h1>

                        {/* Stock Chart */}
                        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                            <h2 className="text-xl font-semibold mb-4">Stock Levels Overview</h2>
                            <div className="h-[300px]">
                                <Line options={chartOptions} data={stockChartData} />
                            </div>
                        </div>

                        {/* Filters and Controls */}
                        <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-center">
                    <input
                        type="text"
                                placeholder="Search products or locations..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="border p-2 rounded flex-1"
                            />
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={showLowStock}
                                    onChange={(e) => setShowLowStock(e.target.checked)}
                                />
                                Show Low Stock Only
                            </label>
                        </div>

                        {/* Updated Stock Form */}
                        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                            <h2 className="text-xl font-semibold mb-4">{editStockId ? 'Edit Stock' : 'Add New Stock'}</h2>
                            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Size Selection with Add New Button */}
                                <div className="space-y-4">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                                            <select
                                                name="sizeId"
                                                value={stock.sizeId}
                                                onChange={handleSizeChange}
                                                className="border p-2 rounded w-full"
                        required
                                            >
                                                <option value="">Select Size</option>
                                                {sizes.map((size) => (
                                                    <option key={size.id} value={size.id}>
                                                        {size.name} - ₱{size.price.toFixed(2)}
                                                        {size.maxVarieties > 0 ? ` (Can mix up to ${size.maxVarieties} varieties)` : ' (Bibingka only)'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsAddSizeOrVarietyOpen(true)}
                                            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                                        >
                                            Add New
                                        </button>
                                    </div>
                                </div>

                                {/* Varieties Selection - Only show after size is selected */}
                                {stock.sizeId && (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                            Select Varieties (Max: {sizes.find(s => s.id === stock.sizeId)?.maxVarieties})
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {varieties.map((variety) => {
                                                const selectedSize = sizes.find(s => s.id === stock.sizeId);
                                                const isDisabled = selectedSize?.availableVarieties && 
                                                    !selectedSize.availableVarieties.includes(variety.name);
                                                
                                                const shouldDisable = (selectedSize?.name === 'Solo' || selectedSize?.name === 'Small') && variety.name !== 'Bibingka';

                                                return (
                                                    <label key={variety.id} className="flex items-center space-x-2">
                                                        <input
                                                            type="checkbox"
                                                            value={variety.name}
                                                            checked={selectedVarieties.includes(variety.name)}
                                                            onChange={() => handleVarietyChange(variety.name)}
                                                            disabled={shouldDisable}
                                                            className="rounded border-gray-300"
                                                        />
                                                        <span className={shouldDisable ? 'text-gray-400' : ''}>
                                                            {variety.name}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Stock Details */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                        type="number"
                        name="quantity"
                        value={stock.quantity}
                        onChange={handleChange}
                                                min="0"
                                                step="1"
                        required
                        className="border p-2 rounded w-full"
                    />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock</label>
                    <input
                                                type="number"
                                                name="minimumStock"
                                                value={stock.minimumStock}
                        onChange={handleChange}
                                                min="0"
                                                step="1"
                        className="border p-2 rounded w-full"
                    />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Point</label>
                    <input
                                            type="number"
                                            name="reorderPoint"
                                            value={stock.reorderPoint}
                        onChange={handleChange}
                                            min="0"
                                            step="1"
                        className="border p-2 rounded w-full"
                    />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Production Date</label>
                                            <input
                                                type="date"
                                                name="productionDate"
                                                value={stock.productionDate}
                                                onChange={handleChange}
                                                className="border p-2 rounded w-full"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                    <input
                        type="date"
                                                name="expiryDate"
                                                value={stock.expiryDate}
                        onChange={handleChange}
                        className="border p-2 rounded w-full"
                                                required
                                                min={stock.productionDate} // Ensure expiry date is after production date
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Remarks - Full Width */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                    <textarea
                        name="remarks"
                        value={stock.remarks}
                        onChange={handleChange}
                                        className="border p-2 rounded w-full h-20"
                    ></textarea>
                                </div>

                                {/* Form Buttons */}
                                <div className="md:col-span-2 flex gap-2">
                    <button
                        type="submit"
                                        disabled={loading || selectedVarieties.length === 0}
                                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex-1 disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : (editStockId ? 'Update Stock' : 'Add Stock')}
                                    </button>
                                    {editStockId && (
                                    <button
                                            type="button"
                                            onClick={resetForm}
                                            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                                        >
                                            Cancel
                    </button>
                                    )}
                                </div>
                </form>
                        </div>

                        {/* Stock List */}
                        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                            <h2 className="text-xl font-semibold mb-4">Stock List</h2>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="p-3 text-left">Varieties</th>
                                            <th className="p-3 text-left">Size</th>
                                            <th className="p-3 text-right">Quantity</th>
                                            <th className="p-3 text-right">Price</th>
                                            <th className="p-3 text-center">Stock Status</th>
                                            <th className="p-3 text-center">Expiry Status</th>
                                            <th className="p-3 text-left">Expiry Date</th>
                                            <th className="p-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStocks.map((stk) => {
                                            const expiryStatus = getExpiryStatus(stk.expiryDate);
                                            return (
                                                <tr key={stk.id} className="border-t hover:bg-gray-50">
                                                    <td className="p-3">
                                                        <div className="font-medium">
                                                            {stk.varieties?.join(', ') || 'No varieties selected'}
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-medium">{stk.sizeName}</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="font-medium">{stk.quantity}</div>
                                                        <div className="text-sm text-gray-500">Min: {stk.minimumStock}</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        {sizes.find(s => s.id === stk.sizeId)?.price.toLocaleString('en-PH', {
                                                            style: 'currency',
                                                            currency: 'PHP'
                                                        })}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                                            stk.quantity <= stk.minimumStock
                                                                ? 'bg-red-100 text-red-800'
                                                                : stk.quantity <= stk.reorderPoint
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-green-100 text-green-800'
                                                        }`}>
                                                            {stk.quantity <= stk.minimumStock
                                                                ? 'Low Stock'
                                                                : stk.quantity <= stk.reorderPoint
                                                                ? 'Reorder Soon'
                                                                : 'In Stock'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${expiryStatus.className}`}>
                                                            {expiryStatus.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-left">
                                                        <div className="font-medium">
                                                            {new Date(stk.expiryDate).toLocaleDateString()}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Prod: {new Date(stk.productionDate).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex justify-center gap-2">
                                                            <button
                                                                onClick={() => handleStockAdjustment(stk.id, 1)}
                                                                className="p-1 hover:bg-gray-100 rounded"
                                                                title="Add Stock"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleStockAdjustment(stk.id, -1)}
                                                                className="p-1 hover:bg-gray-100 rounded"
                                                                title="Remove Stock"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                    <button
                                                                onClick={() => handleEdit(stk)}
                                                                className="p-1 hover:bg-gray-100 rounded"
                                                                title="Edit"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                                </svg>
                                    </button>
                                    <button
                                                                onClick={() => handleDelete(stk.id)}
                                                                className="p-1 hover:bg-gray-100 rounded"
                                                                title="Delete"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Stock History */}
                        <div className="bg-white p-6 rounded-lg shadow-md">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold">Stock History</h2>
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className="text-blue-600 hover:text-blue-800"
                                >
                                    {showHistory ? 'Hide History' : 'Show History'}
                                </button>
                            </div>
                            {showHistory && (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full">
                                        <thead>
                                            <tr className="bg-gray-50">
                                                <th className="p-3 text-left">Date</th>
                                                <th className="p-3 text-left">Size</th>
                                                <th className="p-3 text-left">Varieties</th>
                                                <th className="p-3 text-center">Type</th>
                                                <th className="p-3 text-right">Previous</th>
                                                <th className="p-3 text-right">Change</th>
                                                <th className="p-3 text-right">New</th>
                                                <th className="p-3 text-left">Updated By</th>
                                                <th className="p-3 text-left">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockHistory.map((history) => (
                                                <tr key={history.id} className="border-t hover:bg-gray-50">
                                                    <td className="p-3">{history.date.toLocaleDateString()}</td>
                                                    <td className="p-3">{history.sizeName}</td>
                                                    <td className="p-3">{(history.varieties || []).join(', ')}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                                            history.type === 'in' ? 'bg-green-100 text-green-800' :
                                                            history.type === 'out' ? 'bg-red-100 text-red-800' :
                                                            'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {history.type === 'in' ? 'Stock In' :
                                                             history.type === 'out' ? 'Stock Out' :
                                                             'Adjustment'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right">{history.previousStock}</td>
                                                    <td className="p-3 text-right">{history.quantity}</td>
                                                    <td className="p-3 text-right">{history.currentStock}</td>
                                                    <td className="p-3">{history.updatedBy}</td>
                                                    <td className="p-3">{history.remarks}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Adding New Size/Variety */}
            {isAddSizeOrVarietyOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md max-h-[80vh] overflow-y-auto">
                        <h2 className="text-xl font-semibold mb-4">Manage Sizes and Varieties</h2>
                        <form onSubmit={handleAddSizeOrVariety} className="space-y-4">
                            {/* Existing size input fields */}
                            <div className="border-b pb-4">
                                <h3 className="font-medium mb-2">Add New Size</h3>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="Size Name (e.g., Family Bilao)"
                                        value={newSizeName}
                                        onChange={(e) => setNewSizeName(e.target.value)}
                                        className="w-full p-2 border rounded"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Price"
                                        value={newSizePrice}
                                        onChange={(e) => setNewSizePrice(e.target.value)}
                                        className="w-full p-2 border rounded"
                                        min="0"
                                        step="0.01"
                                    />
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">
                                            Maximum Varieties Allowed
                                        </label>
                                        <input
                                            type="number"
                                            value={newSizeMaxVarieties}
                                            onChange={(e) => setNewSizeMaxVarieties(e.target.value)}
                                            className="w-full p-2 border rounded"
                                            min="0"
                                            max="5"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Current Sizes List */}
                            <div className="border-b pb-4">
                                <h3 className="font-medium mb-2">Current Sizes</h3>
                                <div className="space-y-2">
                                    {sizes.map((size) => (
                                        <div key={size.id} className="flex justify-between items-center">
                                            <span>{size.name} - ₱{size.price}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSize(size.id)}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                        Delete
                                    </button>
                                </div>
                                    ))}
                                </div>
                            </div>

                            {/* Existing variety input field */}
                            <div className="border-b pb-4">
                                <h3 className="font-medium mb-2">Add New Variety</h3>
                                <input
                                    type="text"
                                    placeholder="Variety Name"
                                    value={newVarietyName}
                                    onChange={(e) => setNewVarietyName(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            {/* Current Varieties List */}
                            <div className="border-b pb-4">
                                <h3 className="font-medium mb-2">Current Varieties</h3>
                                <div className="space-y-2">
                                    {varieties.map((variety) => (
                                        <div key={variety.id} className="flex justify-between items-center">
                                            <span>{variety.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteVariety(variety.id)}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                                Delete
                                            </button>
                            </div>
                        ))}
                    </div>
                            </div>

                            {/* Existing form buttons */}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddSizeOrVarietyOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                    Add
                                </button>
                            </div>
                        </form>
                </div>
            </div>
            )}
        </ProtectedRoute>
    );
}
