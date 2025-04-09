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
  name: string; // This can be the size name
  varieties: string[]; // Array of varieties
  currentStock: number;
  minimumStock: number;
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
}

interface OrderData {
  userId: string;
  orderDetails: {
    totalAmount: number;
    status: string;
    completedAt: string;
    updatedAt: string;
  };
}

interface CustomerData {
  firstName: string;
  lastName: string;
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

  useEffect(() => {
    fetchDashboardData();
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
      const now = new Date();
      const dayStart = new Date(now.setHours(0, 0, 0, 0));
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const salesRef = collection(db, "sales");
      
      // Daily sales
      const dailyQuery = query(
        salesRef,
        where("date", ">=", Timestamp.fromDate(dayStart))
      );
      const dailySnapshot = await getDocs(dailyQuery);
      const dailySales = dailySnapshot.docs.reduce((acc, doc) => acc + doc.data().amount, 0);

      // Weekly sales
      const weeklyQuery = query(
        salesRef,
        where("date", ">=", Timestamp.fromDate(weekStart))
      );
      const weeklySnapshot = await getDocs(weeklyQuery);
      const weeklySales = weeklySnapshot.docs.reduce((acc, doc) => acc + doc.data().amount, 0);

      // Monthly sales
      const monthlyQuery = query(
        salesRef,
        where("date", ">=", Timestamp.fromDate(monthStart))
      );
      const monthlySnapshot = await getDocs(monthlyQuery);
      const monthlySales = monthlySnapshot.docs.reduce((acc, doc) => acc + doc.data().amount, 0);

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
          where("date", ">=", Timestamp.fromDate(date)),
          where("date", "<", Timestamp.fromDate(nextDate))
        );
        const daySnapshot = await getDocs(dayQuery);
        const dayTotal = daySnapshot.docs.reduce((acc, doc) => acc + doc.data().amount, 0);
        
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
      const salesRef = collection(db, "sales");
      const salesQuery = query(salesRef, orderBy("date", "desc"));
      const salesSnapshot = await getDocs(salesQuery);
      
      // Aggregate product sales
      const productSales = new Map();
      salesSnapshot.docs.forEach(doc => {
        const saleData = doc.data();
        saleData.items.forEach((item: any) => {
          const key = `${item.size} - ${item.varieties.join(", ")}`;
          if (!productSales.has(key)) {
            productSales.set(key, {
              name: key,
              totalSold: 0,
              revenue: 0
            });
          }
          const product = productSales.get(key);
          product.totalSold += item.quantity;
          product.revenue += item.subtotal;
        });
      });

      // Convert to array and sort by total sold
      const popularProducts = Array.from(productSales.values())
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 5);

      setPopularProducts(popularProducts);

      // Update product chart
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
        where("orderDetails.status", "==", "Completed"),
        orderBy("orderDetails.completedAt", "desc"),
        limit(5)
      );
      const snapshot = await getDocs(recentQuery);
      
      const orders = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data() as OrderData;
        let customerName = "Unknown Customer";
        
        if (data.userId) {
          const customerRef = doc(db, "customers", data.userId);
          const customerDoc = await getDoc(customerRef);
          if (customerDoc.exists()) {
            const customerData = customerDoc.data() as CustomerData;
            customerName = `${customerData.firstName} ${customerData.lastName}`;
          }
        }

        return {
          id: docSnapshot.id,
          customerName,
          total: data.orderDetails.totalAmount,
          status: data.orderDetails.status,
          date: data.orderDetails.completedAt
            ? new Date(data.orderDetails.completedAt)
            : new Date(data.orderDetails.updatedAt)
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
      
      const lowStock = snapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().sizeName,
          varieties: doc.data().varieties || [],
          currentStock: doc.data().quantity,
          minimumStock: doc.data().minimumStock || 10
        }))
        .filter(item => item.currentStock <= item.minimumStock);
      
      setLowStockItems(lowStock);
      
      // Add notifications for low stock items
      lowStock.forEach(item => {
        const message = `Low stock alert: ${item.name} (${item.currentStock} remaining) - Varieties: ${item.varieties.join(', ')}`;
        // Check if the notification already exists
        if (!notifications.some(notification => notification.message === message)) {
          console.log(`Adding notification: ${message}`); // Debugging log
          setNotifications(prev => [...prev, {
            message,
            type: 'warning'
          }]);
        } else {
          console.log(`Notification already exists: ${message}`); // Debugging log
        }
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
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar will be rendered by the layout component */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Header with Notifications */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Dashboard Overview</h1>
                <p className="text-gray-600 mt-1">Welcome to your business analytics</p>
        </div>

              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 hover:bg-gray-100 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bell">
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
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg shadow-lg text-white">
                <h3 className="text-lg font-semibold mb-2">Daily Sales</h3>
                <p className="text-2xl">₱{salesData.daily.toLocaleString()}</p>
                <p className="text-sm opacity-75 mt-2">Today's revenue</p>
              </div>
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg shadow-lg text-white">
                <h3 className="text-lg font-semibold mb-2">Weekly Sales</h3>
                <p className="text-2xl">₱{salesData.weekly.toLocaleString()}</p>
                <p className="text-sm opacity-75 mt-2">Last 7 days</p>
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg shadow-lg text-white">
                <h3 className="text-lg font-semibold mb-2">Monthly Sales</h3>
                <p className="text-2xl">₱{salesData.monthly.toLocaleString()}</p>
                <p className="text-sm opacity-75 mt-2">This month</p>
              </div>
              <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 rounded-lg shadow-lg text-white">
                <h3 className="text-lg font-semibold mb-2">Low Stock Items</h3>
                <p className="text-2xl">{lowStockItems.length}</p>
                <p className="text-sm opacity-75 mt-2">Items need attention</p>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Sales Trend Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold mb-4">Sales Trend</h3>
                <div className="h-[300px]">
                  <Line options={chartOptions} data={salesChartData} />
                </div>
              </div>

              {/* Popular Products Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold mb-4">Popular Products</h3>
                <div className="h-[300px]">
                  <Bar options={chartOptions} data={productChartData} />
                </div>
              </div>
            </div>

            {/* Recent Orders and Low Stock Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Recent Orders */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Recent Orders</h3>
                  <button 
                    onClick={handleViewAllOrders}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Customer</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{order.customerName}</td>
                          <td className="text-right p-2">₱{order.total.toLocaleString()}</td>
                          <td className="text-center p-2">
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
              </div>

              {/* Low Stock Alerts */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Low Stock Alerts</h3>
                  <button 
                    onClick={handleViewAllStock}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Size</th>
                        <th className="text-left p-2">Varieties</th>
                        <th className="text-right p-2">Current Stock</th>
                        <th className="text-right p-2">Min Stock</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 break-words max-w-xs">{item.name}</td>
                          <td className="p-2 break-words max-w-xs">{item.varieties.join(', ') || 'No varieties'}</td>
                          <td className="text-right p-2">{item.currentStock}</td>
                          <td className="text-right p-2">{item.minimumStock}</td>
                          <td className="text-center p-2">
                            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                              Low Stock
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
        </div>

        {/* Notification Dropdown */}
        {showNotifications && (
            <div className="fixed top-20 right-6 w-80 bg-white rounded-lg shadow-xl z-50">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Notifications</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.map((notification, index) => (
                  <div key={index} className={`p-4 border-b ${
                    notification.type === 'error' ? 'bg-red-50' :
                    notification.type === 'warning' ? 'bg-yellow-50' :
                    'bg-green-50'
                  }`}>
                    <p className={`text-sm ${
                      notification.type === 'error' ? 'text-red-800' :
                      notification.type === 'warning' ? 'text-yellow-800' :
                      'text-green-800'
                    }`}>
                      {notification.message}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t">
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
