"use client"; // Required for using hooks

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit, Timestamp, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase-config"; // Adjust the import based on your setup
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
import React from 'react';
/* import Notification from "@/app/components/Notification"; // Import the Notification component */

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

interface SalesData {
  daily: number;
  weekly: number;
  monthly: number;
}

interface PopularProduct {
  id: string;
  name: string;
  totalSold: number;
  revenue: number;
}

interface RecentOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  date: Date;
}

interface LowStockItem {
  id: string;
  name: string;
  varieties: string[];
  currentStock: number;
  minimumStock: number;
  reorderPoint: number;
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string | string[];
    backgroundColor?: string | string[];
    tension?: number;
    borderWidth?: number;
  }[];
}

interface Stock {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  supplier: string;
  supplierContact: string;
  supplierEmail: string;
  minimumStock: number;
  reorderPoint: number;
  receivedDate: string;
  lastUpdated: Date;
  price: number;
  category: string;
  location: string;
  remarks: string;
  varieties?: string[];
  sizeName?: string;
  size?: string;
  variety?: string;
}

interface OrderData {
  userId: string;
  orderDetails: {
    totalAmount: number;
    status: string;
    completedAt: string;
    updatedAt: string;
    createdAt: string;
  };
  userDetails?: {
    firstName: string;
    lastName: string;
  };
  customerDetails?: {
    name: string;
  };
}

interface CustomerData {
  firstName: string;
  lastName: string;
}

interface GroupedStock {
  id: string;
  size: string;
  variety: string;
  quantity: number;
  minimumStock: number;
  reorderPoint: number;
  varieties: string[];
}

export default function Dashboard() {
  const router = useRouter(); // Next.js navigation
  const [salesData, setSalesData] = useState<SalesData>({ daily: 0, weekly: 0, monthly: 0 });
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [notifications, setNotifications] = useState<{ message: string; type: 'success' | 'error' | 'warning' }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [salesChartData, setSalesChartData] = useState<ChartData>({
    labels: [],
    datasets: [{
      label: 'Sales',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.5)',
      tension: 0.1
    }]
  });

  const [productChartData, setProductChartData] = useState<ChartData>({
    labels: [],
    datasets: [{
      label: 'Products Sold',
      data: [],
      backgroundColor: [
        'rgba(255, 99, 132, 0.5)',
        'rgba(54, 162, 235, 0.5)',
        'rgba(255, 206, 86, 0.5)',
        'rgba(75, 192, 192, 0.5)',
        'rgba(153, 102, 255, 0.5)',
      ],
      borderColor: [
        'rgba(255, 99, 132, 1)',
        'rgba(54, 162, 235, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(153, 102, 255, 1)',
      ],
      borderWidth: 1
    }]
  });

  const [stock, setStock] = useState<Stock>({
    id: '',
    productName: "",
    quantity: 0,
    unit: "",
    supplier: "",
    supplierContact: "",
    supplierEmail: "",
    minimumStock: 0,
    reorderPoint: 0,
    receivedDate: "",
    lastUpdated: new Date(),
    price: 0,
    category: "",
    location: "",
    remarks: ""
  });

  const [stockList, setStockList] = useState<Stock[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<Stock[]>([]);
  const [hasNewOrders, setHasNewOrders] = useState(false);
  const [lastCheckedOrder, setLastCheckedOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    fetchStockList();
    
    // Set up interval to check for new orders every 30 seconds
    const orderCheckInterval = setInterval(checkNewOrders, 30000);
    
    return () => {
      clearInterval(orderCheckInterval);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        fetchSalesData(),
        fetchPopularProducts(),
        fetchRecentOrders(),
        fetchLowStockItems(),
        fetchInventoryMetrics()
      ]);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch dashboard data", type: 'error' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSalesData = async () => {
    try {
      const salesRef = collection(db, "orders");
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Daily sales
      const dailyQuery = query(
        salesRef,
        where("orderDetails.status", "==", "Completed"),
        where("orderDetails.completedAt", ">=", today.toISOString())
      );
      const dailySnapshot = await getDocs(dailyQuery);
      const dailySales = dailySnapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return acc + data.orderDetails.totalAmount;
      }, 0);

      // Weekly sales
      const weeklyQuery = query(
        salesRef,
        where("orderDetails.status", "==", "Completed"),
        where("orderDetails.completedAt", ">=", weekStart.toISOString())
      );
      const weeklySnapshot = await getDocs(weeklyQuery);
      const weeklySales = weeklySnapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return acc + data.orderDetails.totalAmount;
      }, 0);

      // Monthly sales
      const monthlyQuery = query(
        salesRef,
        where("orderDetails.status", "==", "Completed"),
        where("orderDetails.completedAt", ">=", monthStart.toISOString())
      );
      const monthlySnapshot = await getDocs(monthlyQuery);
      const monthlySales = monthlySnapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return acc + data.orderDetails.totalAmount;
      }, 0);

      setSalesData({ daily: dailySales, weekly: weeklySales, monthly: monthlySales });
      setTotalRevenue(monthlySales);

      // Prepare sales trend data
      const last7DaysData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);

        const dayQuery = query(
          salesRef,
          where("orderDetails.status", "==", "Completed"),
          where("orderDetails.completedAt", ">=", date.toISOString()),
          where("orderDetails.completedAt", "<", nextDate.toISOString())
        );
        const daySnapshot = await getDocs(dayQuery);
        const dayTotal = daySnapshot.docs.reduce((acc, doc) => {
          const data = doc.data();
          return acc + data.orderDetails.totalAmount;
        }, 0);
        
        last7DaysData.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          amount: dayTotal
        });
      }

      setSalesChartData({
        labels: last7DaysData.map(d => d.date),
        datasets: [{
          label: 'Daily Sales',
          data: last7DaysData.map(d => d.amount),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.1
        }]
      });

    } catch (error) {
      console.error("Error fetching sales data:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch sales data", type: 'error' }]);
    }
  };

  const fetchPopularProducts = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const ordersQuery = query(
        ordersRef,
        where("orderDetails.status", "==", "Completed"),
        orderBy("orderDetails.completedAt", "desc")
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      
      // Aggregate product sales
      const productSales = new Map();
      
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        orderData.items?.forEach((item: any) => {
          const key = item.productName;
          if (!productSales.has(key)) {
            productSales.set(key, {
              name: key,
              totalSold: 0,
              revenue: 0,
              varieties: new Set()
            });
          }
          const product = productSales.get(key);
          product.totalSold += item.quantity;
          product.revenue += (item.quantity * item.price);
          if (item.selectedVarieties && Array.isArray(item.selectedVarieties)) {
            item.selectedVarieties.forEach((variety: string) => {
              product.varieties.add(variety);
            });
          }
        });
      });

      // Convert to array and sort by total sold
      const popularProducts = Array.from(productSales.values())
        .map(product => ({
          ...product,
          varieties: Array.from(product.varieties)
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 5);

      setPopularProducts(popularProducts);

      // Update product chart
      setProductChartData({
        labels: popularProducts.map(p => {
          const varietiesText = p.varieties.length > 0 ? ` (${p.varieties.join(', ')})` : '';
          return `${p.name}${varietiesText}`;
        }),
        datasets: [{
          label: 'Products Sold',
          data: popularProducts.map(p => p.totalSold),
          backgroundColor: [
            'rgba(255, 99, 132, 0.5)',
            'rgba(54, 162, 235, 0.5)',
            'rgba(255, 206, 86, 0.5)',
            'rgba(75, 192, 192, 0.5)',
            'rgba(153, 102, 255, 0.5)',
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)',
          ],
          borderWidth: 1
        }]
      });
    } catch (error) {
      console.error("Error fetching popular products:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch popular products", type: 'error' }]);
    }
  };

  const fetchRecentOrders = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const recentQuery = query(
        ordersRef,
        orderBy("orderDetails.createdAt", "desc"),
        limit(10)
      );
      const snapshot = await getDocs(recentQuery);
      
      const orders = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        let customerName = "Walk-in Customer";
        
        if (data.userDetails?.firstName && data.userDetails?.lastName) {
          customerName = `${data.userDetails.firstName} ${data.userDetails.lastName}`;
        } else if (data.customerDetails?.name) {
          customerName = data.customerDetails.name;
        }

        return {
          id: docSnapshot.id,
          customerName,
          total: data.orderDetails.totalAmount,
          status: data.orderDetails.status,
          date: new Date(data.orderDetails.createdAt)
        };
      }));
      
      setRecentOrders(orders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch recent orders", type: 'error' }]);
    }
  };

  const fetchLowStockItems = async () => {
    try {
      const stockRef = collection(db, "stocks");
      const snapshot = await getDocs(stockRef);
      
      const stockItems = snapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().sizeName || doc.data().variety || doc.data().productName,
          varieties: doc.data().varieties || [],
          currentStock: doc.data().quantity,
          minimumStock: doc.data().minimumStock || 10,
          reorderPoint: doc.data().reorderPoint || 20
        }))
        .filter(item => item.currentStock <= item.reorderPoint || item.currentStock === 0);
      
      setLowStockItems(stockItems);
      
      // Clear existing notifications before adding new ones
      setNotifications([]);
      
      // Add notifications for low stock and out of stock items
      stockItems.forEach(item => {
        let status = '';
        let type: 'warning' | 'error' = 'warning';

        if (item.currentStock === 0) {
          status = 'Out of Stock';
          type = 'error';
        } else if (item.currentStock <= item.minimumStock) {
          status = 'Critical Level';
          type = 'error';
        } else if (item.currentStock <= item.reorderPoint) {
          status = 'Low Stock';
          type = 'warning';
        }

        const message = `${status}: ${item.name} (${item.currentStock} remaining)${item.varieties.length ? ` - Varieties: ${item.varieties.join(', ')}` : ''}`;
        
        setNotifications(prev => [...prev, {
          message,
          type
        }]);
      });
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch inventory alerts", type: 'error' }]);
    }
  };

  const fetchInventoryMetrics = async () => {
    try {
      const stockRef = collection(db, "stocks");
      const snapshot = await getDocs(stockRef);
      
      let totalValue = 0;
      let totalItems = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        totalValue += (data.quantity * data.price) || 0;
        totalItems += data.quantity || 0;
      });
      
      setTotalInventoryValue(totalValue);
      setTotalProducts(totalItems);
    } catch (error) {
      console.error("Error fetching inventory metrics:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch inventory metrics", type: 'error' }]);
    }
  };

  const fetchStockList = async () => {
    try {
      const stockRef = collection(db, "stocks");
      const snapshot = await getDocs(stockRef);
      
      const stocks = snapshot.docs
        .map(doc => {
          const data = doc.data();
          // Only include stocks that have either a size or variety
          if (!data.sizeName && !data.size && !data.variety && (!data.varieties || data.varieties.length === 0)) {
            return null;
          }
          return {
            id: doc.id,
            productName: data.productName || '',
            quantity: data.quantity || 0,
            unit: data.unit || '',
            supplier: data.supplier || '',
            supplierContact: data.supplierContact || '',
            supplierEmail: data.supplierEmail || '',
            minimumStock: data.minimumStock || 10,
            reorderPoint: data.reorderPoint || 20,
            receivedDate: data.receivedDate || '',
            lastUpdated: new Date(data.lastUpdated),
            price: data.price || 0,
            category: data.category || '',
            location: data.location || '',
            remarks: data.remarks || '',
            size: data.sizeName || data.size || 'N/A',
            variety: data.variety || (data.varieties && data.varieties.length > 0 ? data.varieties[0] : 'N/A'),
            varieties: data.varieties || []
          } as Stock;
        })
        .filter((stock): stock is Stock => stock !== null); // Type guard to remove null entries

      // Sort sizes in a specific order
      const sizeOrder = ['1/4', 'Small', 'Medium', 'Large', 'XLarge', '2XL', '3XL'];
      
      // Sort stocks by size first, then by variety
      const organizedStocks = stocks
        .filter(stock => stock.quantity > 0) // Only show items with stock
        .sort((a, b) => {
          const indexA = sizeOrder.indexOf(a.size || '');
          const indexB = sizeOrder.indexOf(b.size || '');
          
          // If both sizes are in the sizeOrder array
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }
          
          // If only one size is in the sizeOrder array
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          
          // If neither size is in the sizeOrder array, sort alphabetically
          if ((a.size || '') === (b.size || '')) {
            return (a.variety || '').localeCompare(b.variety || '');
          }
          return (a.size || '').localeCompare(b.size || '');
        });

      setStockList(organizedStocks);
      
      // Filter out of stock items from the size/variety stocks only
      const outOfStock = stocks.filter(stock => stock.quantity === 0);
      setOutOfStockItems(outOfStock);
    } catch (error) {
      console.error("Error fetching stock list:", error);
      setNotifications(prev => [...prev, { message: "Failed to fetch stock list", type: 'error' }]);
    }
  };

  const checkNewOrders = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const latestOrderQuery = query(
        ordersRef,
        orderBy("orderDetails.createdAt", "desc"),
        limit(1)
      );
      
      const snapshot = await getDocs(latestOrderQuery);
      if (!snapshot.empty) {
        const latestOrder = snapshot.docs[0];
        const latestOrderId = latestOrder.id;
        const latestOrderData = latestOrder.data() as OrderData;
        
        // Only notify for new orders that haven't been checked yet
        if (lastCheckedOrder !== latestOrderId && new Date(latestOrderData.orderDetails.createdAt).getTime() > (lastCheckedOrder ? new Date(lastCheckedOrder).getTime() : 0)) {
          setHasNewOrders(true);
          
          // Clear previous notifications that aren't order-related
          setNotifications(prev => prev.filter(notif => !notif.message.includes('New Order Received')));
          
          // Add new order notification
          setNotifications(prev => [{
            message: `New Order Received: #${latestOrderId.slice(0, 6)} - ${
              latestOrderData.userDetails?.firstName && latestOrderData.userDetails?.lastName
                ? `${latestOrderData.userDetails.firstName} ${latestOrderData.userDetails.lastName}`
                : latestOrderData.customerDetails?.name || 'Walk-in Customer'
            }`,
            type: 'success'
          }, ...prev]);
          
          setLastCheckedOrder(latestOrderId);
        }
      }
    } catch (error) {
      console.error("Error checking new orders:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth); // Sign out user
      router.push("/"); // Redirect to home page
    } catch (error: any) {
      console.error("Logout error:", error.code, error.message);
      setNotifications(prev => [...prev, { message: "Logout failed. Please try again.", type: 'error' }]);
    }
  };

  // Add new function to prepare chart data
  const prepareChartData = () => {
    // Prepare sales chart data
    const salesLabels = recentOrders.map(order => 
      new Date(order.date).toLocaleDateString()
    ).reverse();
    const salesData = recentOrders.map(order => order.total).reverse();

    setSalesChartData({
      labels: salesLabels,
      datasets: [{
        label: 'Daily Sales',
        data: salesData,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1
      }]
    });

    // Prepare product chart data
    setProductChartData({
      labels: popularProducts.map(p => p.name),
      datasets: [{
        label: 'Products Sold',
        data: popularProducts.map(p => p.totalSold),
        backgroundColor: [
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)',
          'rgba(75, 192, 192, 0.5)',
          'rgba(153, 102, 255, 0.5)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 1
      }]
    });
  };

  useEffect(() => {
    if (recentOrders.length > 0 && popularProducts.length > 0) {
      prepareChartData();
    }
  }, [recentOrders, popularProducts]);

  // Add navigation handlers
  const handleViewAllOrders = () => {
    router.push('/orders');
  };

  const handleViewAllStock = () => {
    router.push('/inventory/stock-management');
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900"></div>
        </div>
      </ProtectedRoute>
    );
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gray-50">
        <div className="flex-1 p-6">
          {/* Header with Notifications */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Welcome back! Here's your business overview</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)} 
                  className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                  </svg>
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500">Daily Sales</h3>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">₱{salesData.daily.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Today's revenue</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500">Weekly Sales</h3>
                <span className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18"/>
                    <path d="m19 9-5 5-4-4-3 3"/>
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">₱{salesData.weekly.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500">Monthly Sales</h3>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">₱{salesData.monthly.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">This month</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-500">Stock Alerts</h3>
                <span className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{lowStockItems.length}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                  {lowStockItems.filter(item => item.currentStock <= item.minimumStock).length} Critical
                </span>
                <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                  {lowStockItems.filter(item => item.currentStock > item.minimumStock).length} Low
                </span>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Sales Trend Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Sales Trend</h3>
                <select className="text-sm border-gray-200 rounded-lg focus:ring-blue-500">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Last 90 days</option>
                </select>
              </div>
              <div className="h-[300px]">
                <Line options={{
                  ...chartOptions,
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }} data={salesChartData} />
              </div>
            </div>

            {/* Popular Products Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Popular Products</h3>
                <select className="text-sm border-gray-200 rounded-lg focus:ring-blue-500">
                  <option>By Quantity</option>
                  <option>By Revenue</option>
                </select>
              </div>
              <div className="h-[300px]">
                <Bar options={{
                  ...chartOptions,
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }} data={productChartData} />
              </div>
            </div>
          </div>

          {/* Orders and Stock Alerts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Orders Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">Orders</h3>
                  <button
                    onClick={() => router.push('/orders/tracking-orders')}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    View All
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{order.id.slice(0, 6)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {order.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₱{order.total.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            order.status === 'Completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {order.date.toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stock Alerts */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">Stock Alerts</h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                      {lowStockItems.filter(item => item.currentStock === 0).length} Out of Stock
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                      {lowStockItems.filter(item => item.currentStock > 0 && item.currentStock <= item.reorderPoint).length} Low Stock
                    </span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Stock
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {lowStockItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{item.name}</div>
                          {item.varieties.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              Varieties: {item.varieties.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{item.currentStock}</div>
                          <div className="text-xs text-gray-500">Min: {item.minimumStock}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.currentStock === 0 ? 'bg-red-100 text-red-800' :
                            item.currentStock <= item.minimumStock ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.currentStock === 0 ? 'Out of Stock' :
                             item.currentStock <= item.minimumStock ? 'Critical' :
                             'Low Stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Stock List Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Stock List</h3>
                <button
                  onClick={() => router.push('/inventory/stock-management')}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variety
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stockList.map((stock) => (
                    <tr key={stock.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {stock.size}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {stock.variety}
                        </div>
                        {stock.varieties && stock.varieties.length > 1 && (
                          <div className="text-xs text-gray-500 mt-1">
                            +{stock.varieties.length - 1} more varieties
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{stock.quantity}</div>
                        <div className="text-xs text-gray-500">Min: {stock.minimumStock}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          stock.quantity <= stock.minimumStock ? 'bg-red-100 text-red-800' :
                          stock.quantity <= stock.reorderPoint ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {stock.quantity <= stock.minimumStock ? 'Critical' :
                           stock.quantity <= stock.reorderPoint ? 'Low Stock' :
                           'In Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Notification Panel */}
        {showNotifications && (
          <div className="fixed top-20 right-6 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                <span className="text-xs text-gray-500">{notifications.length} new</span>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((notification, index) => (
                  <div 
                    key={index} 
                    className={`p-4 border-b border-gray-100 ${
                      notification.type === 'error' ? 'bg-red-50' :
                      notification.type === 'warning' ? 'bg-yellow-50' :
                      'bg-green-50'
                    }`}
                  >
                    <p className={`text-sm ${
                      notification.type === 'error' ? 'text-red-800' :
                      notification.type === 'warning' ? 'text-yellow-800' :
                      'text-green-800'
                    }`}>
                      {notification.message}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No new notifications
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setShowNotifications(false)}
                className="w-full px-4 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
