"use client";

import { ReactNode, useEffect, useState } from "react";
import ProtectedRoute from "@/app/components/protectedroute";
import { db } from "../../firebase-config";
import { collection, getDocs, query, where, orderBy, Timestamp, addDoc } from "firebase/firestore";
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface StockReport {
    id: string;
    sizeName: string;
    varieties: string[];
    quantity: number;
    minimumStock: number;
    reorderPoint: number;
    price: number;
    productionDate: string;
    expiryDate: string;
    lastUpdated: Date;
}

interface MovementReport {
    id: string;
    date: string;
    sizeName: string;
    varieties: string[];
    type: 'in' | 'out' | 'adjustment';
    quantity: number;
    previousStock: number;
    currentStock: number;
    remarks: string;
    price?: number;
}

interface OrderReport {
    sizeName: ReactNode;
    id: string;
    date: string;
    productName: string;
    quantity: number;
    totalAmount: number;
    status: string;
}

export default function InventoryReports() {
    const [activeTab, setActiveTab] = useState('stock');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [stockReports, setStockReports] = useState<StockReport[]>([]);
    const [movementReports, setMovementReports] = useState<MovementReport[]>([]);
    const [orderReports, setOrderReports] = useState<OrderReport[]>([]);
    const [totalInventoryValue, setTotalInventoryValue] = useState(0);
    const [cogsValue, setCogsValue] = useState(0);

    useEffect(() => {
        fetchReports();
    }, [dateRange]);

    const fetchReports = async () => {
        try {
            // Fetch sizes and create a map of size names to prices
            const sizesSnapshot = await getDocs(collection(db, "sizes"));
            const sizesMap = new Map(
                sizesSnapshot.docs.map(doc => [doc.data().name, doc.data().price])
            );

            // Fetch stock levels
            const stocksSnapshot = await getDocs(collection(db, "stocks"));
            const stocksData = stocksSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    price: sizesMap.get(data.sizeName) || 0,
                    lastUpdated: data.lastUpdated?.toDate() || new Date()
                };
            }) as StockReport[];
            setStockReports(stocksData);

            // Calculate total inventory value
            const totalValue = stocksData.reduce((sum, item) => 
                sum + (item.quantity * (sizesMap.get(item.sizeName) || 0)), 0);
            setTotalInventoryValue(totalValue);

            // Calculate COGS from sales data
            const salesRef = collection(db, "sales");
            const salesQuery = query(salesRef, orderBy("date", "desc"));
            const salesSnapshot = await getDocs(salesQuery);
            
            let totalCOGS = 0;
            salesSnapshot.docs.forEach(doc => {
                const saleData = doc.data();
                // Calculate COGS for each item in the sale
                saleData.items.forEach((item: any) => {
                    const itemPrice = sizesMap.get(item.size) || 0;
                    totalCOGS += itemPrice * item.quantity;
                });
            });
            
            setCogsValue(totalCOGS);

            // Fetch movement history
            const movementsSnapshot = await getDocs(
                query(
                    collection(db, "stockHistory"),
                    orderBy("date", "desc")
                )
            );
            
            const movementsData = movementsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    varieties: data.varieties || [],
                    price: sizesMap.get(data.sizeName) || 0,
                    date: data.date instanceof Timestamp 
                        ? new Date(data.date.seconds * 1000).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        : data.date
                };
            }) as MovementReport[];

            setMovementReports(movementsData);

            // Fetch orders
            const ordersSnapshot = await getDocs(
                query(
                    collection(db, "orders"),
                    where("orderDetails.status", "==", "Completed"),
                    orderBy("orderDetails.completedAt", "desc")
                )
            );
            
            const ordersData = ordersSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    completedAt: data.orderDetails?.completedAt || data.orderDetails?.updatedAt,
                    items: data.items.map((item: any) => ({
                        ...item,
                        price: sizesMap.get(item.productSize) || 0
                    }))
                };
            }) as OrderReport[];
            
            setOrderReports(ordersData);

        } catch (error) {
            console.error("Error fetching reports:", error);
        }
    };

    const getLowStockItems = () => {
        return stockReports.filter(item => item.quantity <= item.minimumStock);
    };

    const getOutOfStockItems = () => {
        return stockReports.filter(item => item.quantity === 0);
    };

    return (
        <ProtectedRoute>
            <div className="flex h-screen overflow-hidden">
                <div className="flex-1 overflow-y-auto bg-gray-100">
                    <div className="p-6">
                        <h1 className="text-3xl font-bold text-gray-800 mb-6">Inventory Reports</h1>

                        {/* Date Range Selector */}
                        <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex gap-4">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="border p-2 rounded"
                            />
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="border p-2 rounded"
                            />
                        </div>

                        {/* Report Type Tabs */}
                        <div className="bg-white rounded-lg shadow-md mb-6">
                            <div className="flex border-b">
                                <button
                                    onClick={() => setActiveTab('stock')}
                                    className={`px-4 py-2 ${activeTab === 'stock' ? 'border-b-2 border-blue-500' : ''}`}
                                >
                                    Stock Levels
                                </button>
                                <button
                                    onClick={() => setActiveTab('movement')}
                                    className={`px-4 py-2 ${activeTab === 'movement' ? 'border-b-2 border-blue-500' : ''}`}
                                >
                                    Stock Movements
                                </button>
                                <button
                                    onClick={() => setActiveTab('valuation')}
                                    className={`px-4 py-2 ${activeTab === 'valuation' ? 'border-b-2 border-blue-500' : ''}`}
                                >
                                    Inventory Valuation
                                </button>
                                <button
                                    onClick={() => setActiveTab('orders')}
                                    className={`px-4 py-2 ${activeTab === 'orders' ? 'border-b-2 border-blue-500' : ''}`}
                                >
                                    Orders
                                </button>
                            </div>

                            {/* Report Content */}
                            <div className="p-4">
                                {activeTab === 'stock' && (
                                    <div className="space-y-6">
                                        {/* Current Stock Levels */}
                                        <div>
                                            <h2 className="text-xl font-semibold mb-4">Current Stock Levels</h2>
                                            <table className="min-w-full">
                                                <thead>
                                                    <tr>
                                                        <th className="text-left p-2">Size</th>
                                                        <th className="text-left p-2">Varieties</th>
                                                        <th className="text-right p-2">Quantity</th>
                                                        <th className="text-right p-2">Minimum Stock</th>
                                                        <th className="text-right p-2">Reorder Point</th>
                                                        <th className="text-right p-2">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {stockReports.map(item => (
                                                        <tr key={item.id} className="border-t">
                                                            <td className="p-2">{item.sizeName}</td>
                                                            <td className="p-2">{item.varieties.join(', ')}</td>
                                                            <td className="p-2 text-right">{item.quantity}</td>
                                                            <td className="p-2 text-right">{item.minimumStock}</td>
                                                            <td className="p-2 text-right">{item.reorderPoint}</td>
                                                            <td className="p-2 text-right">
                                                                ₱{(item.quantity * item.price).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Low Stock Items */}
                                        <div>
                                            <h2 className="text-xl font-semibold mb-4">Low Stock Items</h2>
                                            <table className="min-w-full">
                        <thead>
                            <tr>
                                                        <th className="text-left p-2">Product Name</th>
                                                        <th className="text-right p-2">Current Stock</th>
                                                        <th className="text-right p-2">Minimum Stock</th>
                            </tr>
                        </thead>
                        <tbody>
                                                    {getLowStockItems().map(item => (
                                                        <tr key={item.id} className="border-t">
                                                            <td className="p-2">{item.sizeName}</td>
                                                            <td className="p-2 text-right">{item.quantity}</td>
                                                            <td className="p-2 text-right">{item.minimumStock}</td>
                                    </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Stock Level Chart */}
                                        <div className="h-[300px]">
                                            <Bar
                                                data={{
                                                    labels: stockReports.map(item => `${item.sizeName} (${item.varieties.join(', ')})`),
                                                    datasets: [{
                                                        label: 'Current Stock',
                                                        data: stockReports.map(item => item.quantity),
                                                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                                                    }]
                                                }}
                                                options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: {
                                                            display: true,
                                                            labels: {
                                                                boxWidth: 20,
                                                                font: {
                                                                    size: 14,
                                                                }
                                                            }
                                                        },
                                                        tooltip: {
                                                            callbacks: {
                                                                label: (context) => {
                                                                    const label = context.dataset.label || '';
                                                                    const value = context.raw as number;
                                                                    return `${label}: ${value} units`;
                                                                }
                                                            }
                                                        }
                                                    },
                                                    scales: {
                                                        x: {
                                                            ticks: {
                                                                autoSkip: false,
                                                                font: {
                                                                    size: 12,
                                                                }
                                                            }
                                                        },
                                                        y: {
                                                            beginAtZero: true,
                                                            ticks: {
                                                                font: {
                                                                    size: 12,
                                                                }
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'movement' && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-4">Stock Movements</h2>
                                        <table className="min-w-full">
                                            <thead>
                                                <tr>
                                                    <th className="text-left p-2">Date</th>
                                                    <th className="text-left p-2">Size</th>
                                                    <th className="text-left p-2">Varieties</th>
                                                    <th className="text-left p-2">Type</th>
                                                    <th className="text-right p-2">Quantity</th>
                                                    <th className="text-right p-2">Previous Stock</th>
                                                    <th className="text-right p-2">Current Stock</th>
                                                    <th className="text-right p-2">Value</th>
                                                    <th className="text-left p-2">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {movementReports.map(movement => (
                                                    <tr key={movement.id} className="border-t">
                                                        <td className="p-2">{movement.date}</td>
                                                        <td className="p-2">{movement.sizeName}</td>
                                                        <td className="p-2">{(movement.varieties || []).join(', ')}</td>
                                                        <td className="p-2">
                                                            <span className={`px-2 py-1 rounded-full text-xs ${
                                                                movement.type === 'in' ? 'bg-green-100 text-green-800' :
                                                                movement.type === 'out' ? 'bg-red-100 text-red-800' :
                                                                'bg-yellow-100 text-yellow-800'
                                                            }`}>
                                                                {movement.type}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-right">{movement.quantity}</td>
                                                        <td className="p-2 text-right">{movement.previousStock}</td>
                                                        <td className="p-2 text-right">{movement.currentStock}</td>
                                                        <td className="p-2 text-right">
                                                            ₱{((movement.quantity || 0) * (movement.price || 0)).toLocaleString()}
                                                        </td>
                                                        <td className="p-2">{movement.remarks}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeTab === 'valuation' && (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white p-6 rounded-lg shadow-md">
                                                <h3 className="text-lg font-semibold mb-2">Total Inventory Value</h3>
                                                <p className="text-2xl">₱{totalInventoryValue.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-lg shadow-md">
                                                <h3 className="text-lg font-semibold mb-2">Cost of Goods Sold</h3>
                                                <p className="text-2xl">₱{cogsValue.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Valuation Chart */}
                                        <div className="h-[300px]">
                                            <Pie
                                                data={{
                                                    labels: stockReports.map(item => `${item.sizeName} (${item.varieties.join(', ')})`),
                                                    datasets: [{
                                                        data: stockReports.map(item => item.quantity * (item.price || 0)),
                                                        backgroundColor: [
                                                            'rgba(255, 99, 132, 0.5)',
                                                            'rgba(54, 162, 235, 0.5)',
                                                            'rgba(255, 206, 86, 0.5)',
                                                            'rgba(75, 192, 192, 0.5)',
                                                            'rgba(153, 102, 255, 0.5)',
                                                            'rgba(255, 159, 64, 0.5)',
                                                        ],
                                                    }]
                                                }}
                                                options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: {
                                                            position: 'right',
                                                            labels: {
                                                                boxWidth: 20
                                                            }
                                                        },
                                                        tooltip: {
                                                            callbacks: {
                                                                label: (context) => {
                                                                    const value = context.raw as number;
                                                                    return `₱${value.toLocaleString()}`;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'orders' && (
                                    <div>
                                        <h2 className="text-xl font-semibold mb-4">Order Reports</h2>
                                        <table className="min-w-full">
                                            <thead>
                                                <tr>
                                                    <th className="text-left p-2">Date</th>
                                                    <th className="text-left p-2">Product</th>
                                                    <th className="text-right p-2">Quantity</th>
                                                    <th className="text-right p-2">Total Amount</th>
                                                    <th className="text-center p-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {orderReports.map(order => (
                                                    <tr key={order.id} className="border-t">
                                                        <td className="p-2">{order.date}</td>
                                                        <td className="p-2">{order.sizeName}</td>
                                                        <td className="p-2 text-right">{order.quantity}</td>
                                                        <td className="p-2 text-right">₱{order.totalAmount.toLocaleString()}</td>
                                                        <td className="p-2 text-center">
                                                            <span className={`px-2 py-1 rounded-full text-xs ${
                                                                order.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                'bg-red-100 text-red-800'
                                                            }`}>
                                                                {order.status}
                                                            </span>
                                                        </td>
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
            </div>
        </ProtectedRoute>
    );
}