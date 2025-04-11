"use client"; // Required for using hooks

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../firebase-config"; // Adjust the import based on your setup
import { Line, Bar } from 'react-chartjs-2';
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

interface SalesData {
  daily: number;
  weekly: number;
  monthly: number;
  trend: { date: string; sales: number }[];
}

interface PopularProduct {
  name: string;
  totalSlices: number;
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
  currentStock: number;
  minimumStock: number;
  criticalLevel: number;
  type: 'size' | 'variety';
  severity: 'critical' | 'low';
  varieties?: string[];
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
  quantity: number;
  minimumStock: number;
  criticalLevel: number;
  type: 'size' | 'variety';
  productName?: string;
  unit?: string;
  supplier?: string;
  supplierContact?: string;
  supplierEmail?: string;
  receivedDate?: string;
  lastUpdated?: Date;
  price?: number;
  category?: string;
  location?: string;
  remarks?: string;
  size?: string;
  variety?: string;
  totalSlices?: number;
  sizeName?: string;
  slicesPerUnit?: number;
}

interface OrderData {
  userId: string;
  orderType?: string;
  customerName?: string;
  orderDetails: {
    totalAmount: number;
    status: string;
    orderStatus?: string;
    completedAt: string;
    updatedAt: string;
    createdAt: string;
    isWalkin: boolean;
  };
  userDetails?: {
    firstName: string;
    lastName: string;
  };
  customerDetails?: {
    name: string;
  };
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning';
  orderId?: string;
  createdAt: Date;
  isOrderNotification?: boolean;
}

export default function Dashboard() {
  const router = useRouter(); // Next.js navigation
  const [salesData, setSalesData] = useState<SalesData>({ daily: 0, weekly: 0, monthly: 0, trend: [] });
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
    quantity: 0,
    minimumStock: 0,
    criticalLevel: 0,
    type: 'size'
  });

  const [stockList, setStockList] = useState<Stock[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<Stock[]>([]);
  const [hasNewOrders, setHasNewOrders] = useState(false);
  const [lastCheckedOrder, setLastCheckedOrder] = useState<string | null>(null);

  // Add new state for product sort
  const [productSortBy, setProductSortBy] = useState<'quantity' | 'revenue'>('quantity');

  useEffect(() => {
    fetchDashboardData();
    fetchStockList();
    
    // Check for new orders immediately
    checkNewOrders();
    
    // Set up interval to check for new orders every 10 seconds
    const orderCheckInterval = setInterval(checkNewOrders, 10000);
    
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
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch dashboard data",
        type: 'error',
        createdAt: new Date()
      }]);
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

      setSalesData({ daily: dailySales, weekly: weeklySales, monthly: monthlySales, trend: [] });
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
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch sales data",
        type: 'error',
        createdAt: new Date()
      }]);
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
      
      // Aggregate product sales by variety
      const varietySales = new Map();
      
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        if (!orderData.items) return;
        
        orderData.items.forEach((item: any) => {
          // For each variety in the item
          if (item.productVarieties && Array.isArray(item.productVarieties)) {
            item.productVarieties.forEach((variety: string) => {
              if (!varietySales.has(variety)) {
                varietySales.set(variety, {
                  name: variety,
                  totalSlices: 0,
                  revenue: 0
                });
              }
              const product = varietySales.get(variety);
              // Calculate slices based on size
              let slicesPerUnit = 0;
              switch(item.productSize) {
                case 'Big Bilao': slicesPerUnit = 60; break;
                case 'Tray': slicesPerUnit = 48; break;
                case 'Small': slicesPerUnit = 30; break;
                case 'Half Tray': slicesPerUnit = 24; break;
                case 'Solo': slicesPerUnit = 20; break;
                case '1/4 Slice': slicesPerUnit = 12; break;
                default: slicesPerUnit = 0;
              }
              // Add slices and revenue for this order
              const totalSlices = (slicesPerUnit * item.productQuantity) / item.productVarieties.length;
              product.totalSlices += totalSlices;
              product.revenue += (item.productPrice * item.productQuantity) / item.productVarieties.length;
            });
          }
        });
      });

      // Convert to array and sort based on selected criteria
      const popularProducts = Array.from(varietySales.values())
        .sort((a, b) => productSortBy === 'quantity' ? 
          b.totalSlices - a.totalSlices : 
          b.revenue - a.revenue)
        .slice(0, 5);

      setPopularProducts(popularProducts);

      // Update product chart
      const chartData = {
        labels: popularProducts.map(p => p.name),
        datasets: [{
          label: productSortBy === 'quantity' ? 'Slices Sold' : 'Revenue (₱)',
          data: popularProducts.map(p => 
            productSortBy === 'quantity' ? 
              Math.round(p.totalSlices) : 
              Math.round(p.revenue)
          ),
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
      };
      
      setProductChartData(chartData);
      
    } catch (error) {
      console.error("Error fetching popular products:", error);
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch popular products",
        type: 'error',
        createdAt: new Date()
      }]);
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
        let customerName;
        
        // Check if it's a walk-in order
        if (data.orderDetails.isWalkin) {
          customerName = data.customerDetails?.name || "Walk-in Customer";
        } else {
          // For registered users
          customerName = data.userDetails?.firstName && data.userDetails?.lastName
            ? `${data.userDetails.firstName} ${data.userDetails.lastName}`
            : "Walk-in Customer";
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
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch recent orders",
        type: 'error',
        createdAt: new Date()
      }]);
    }
  };

  const fetchLowStockItems = async () => {
    try {
      const sizeStocksRef = collection(db, "sizeStocks");
      const varietyStocksRef = collection(db, "varietyStocks");

      const [sizeStocksSnapshot, varietyStocksSnapshot] = await Promise.all([
        getDocs(sizeStocksRef),
        getDocs(varietyStocksRef)
      ]);
      
      // Process size stocks
      const sizeStockItems = sizeStocksSnapshot.docs.map(doc => {
        const data = doc.data();
        const currentStock = data.slices || 0;
        const minimumStock = data.minimumStock || 10;
        const criticalLevel = data.criticalLevel || 20;

        // Only include if stock is at or below critical level
        if (currentStock > criticalLevel) {
          return null;
        }

        return {
          id: doc.id,
          name: data.size || 'N/A',
          currentStock,
          minimumStock,
          criticalLevel,
          type: 'size' as const,
          severity: currentStock <= minimumStock ? 'critical' : 'low',
          varieties: []
        } as LowStockItem;
      }).filter((item): item is LowStockItem => item !== null);

      // Process variety stocks
      const varietyStockItems = varietyStocksSnapshot.docs.map(doc => {
        const data = doc.data();
        const currentStock = data.slices || 0;
        const minimumStock = data.minimumStock || 10;
        const criticalLevel = data.criticalLevel || 20;

        // Only include if stock is at or below critical level
        if (currentStock > criticalLevel) {
          return null;
        }

        return {
          id: doc.id,
          name: data.variety || 'N/A',
          currentStock,
          minimumStock,
          criticalLevel,
          type: 'variety' as const,
          severity: currentStock <= minimumStock ? 'critical' : 'low',
          varieties: []
        } as LowStockItem;
      }).filter((item): item is LowStockItem => item !== null);

      // Combine low stock items
      const allStockItems = [...sizeStockItems, ...varietyStockItems];
      
      setLowStockItems(allStockItems);
      
      // Clear existing notifications before adding new ones
      setNotifications([]);
      
      // Update stock notifications
      allStockItems.forEach(item => {
        if (item.currentStock <= item.minimumStock) {
          const itemType = item.type === 'size' ? 'Size' : 'Variety';
          const status = item.currentStock === 0 ? 'Out of Stock' : 'Critical Level';
          const message = `${status}: ${itemType} - ${item.name} (${item.currentStock} slices remaining)`;
          
          setNotifications(prev => [...prev, {
            id: `stock-${item.id}-${Date.now()}`,
            message,
            type: 'error',
            createdAt: new Date()
          }]);
        } else if (item.currentStock <= item.criticalLevel) {
          const itemType = item.type === 'size' ? 'Size' : 'Variety';
          const message = `Low Stock: ${itemType} - ${item.name} (${item.currentStock} slices remaining)`;
          
          setNotifications(prev => [...prev, {
            id: `stock-${item.id}-${Date.now()}`,
            message,
            type: 'warning',
            createdAt: new Date()
          }]);
        }
      });
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch inventory alerts",
        type: 'error',
        createdAt: new Date()
      }]);
    }
  };

  const fetchInventoryMetrics = async () => {
    try {
      const [sizeStocksSnapshot, varietyStocksSnapshot] = await Promise.all([
        getDocs(collection(db, "sizeStocks")),
        getDocs(collection(db, "varietyStocks"))
      ]);
      
      let totalValue = 0;
      let totalItems = 0;
      
      // Process size stocks
      sizeStocksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        totalValue += (data.quantity * (data.price || 0)) || 0;
        totalItems += data.quantity || 0;
      });

      // Process variety stocks
      varietyStocksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        totalValue += (data.quantity * (data.price || 0)) || 0;
        totalItems += data.quantity || 0;
      });
      
      setTotalInventoryValue(totalValue);
      setTotalProducts(totalItems);
    } catch (error) {
      console.error("Error fetching inventory metrics:", error);
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch inventory metrics",
        type: 'error',
        createdAt: new Date()
      }]);
    }
  };

  const fetchStockList = async () => {
    try {
      const sizeStocksRef = collection(db, "sizeStocks");
      const varietyStocksRef = collection(db, "varietyStocks");

      const sizeStocksSnapshot = await getDocs(sizeStocksRef);
      const varietyStocksSnapshot = await getDocs(varietyStocksRef);

      const sizeStocks = sizeStocksSnapshot.docs.map(doc => {
        const data = doc.data();
        // Get the slices per box/tray based on size
        const slicesConfig = {
          'Big Bilao': 60,
          'Half Tray': 24,
          'Small': 30,
          'Solo': 20,
          'Tray': 48,
          '1/4 Slice': 12,

        };
        
        return {
          id: doc.id,
          quantity: data.slices || 0, // Read quantity from slices field
          minimumStock: data.minimumStock || 10,
          criticalLevel: data.criticalLevel || 20,
          type: 'size' as const,
          sizeName: data.size || 'N/A',
          slicesPerUnit: slicesConfig[data.size as keyof typeof slicesConfig] || 0
        } as Stock;
      });

      const varietyStocks = varietyStocksSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productName: data.productName || '',
          quantity: data.quantity || 0,
          unit: data.unit || '',
          supplier: data.supplier || '',
          supplierContact: data.supplierContact || '',
          supplierEmail: data.supplierEmail || '',
          minimumStock: data.minimumStock || 10,
          criticalLevel: data.criticalLevel || 20,
          receivedDate: data.receivedDate || '',
          lastUpdated: new Date(data.lastUpdated || Date.now()),
          price: data.price || 0,
          category: data.category || '',
          location: data.location || '',
          remarks: data.remarks || '',
          size: 'N/A',
          variety: data.variety || '',
          totalSlices: data.slices || 0,
          type: 'variety'
        } as Stock;
      });

      const stocks = [...sizeStocks, ...varietyStocks];

      // Sort sizes in a specific order
      const sizeOrder = [ 'Small', 'Solo', 'Tray', '1/4 Slice', 'Half Tray', 'Big Bilao'];
      
      // Sort stocks by type first (size before variety), then by size order
      const organizedStocks = stocks.sort((a, b) => {
        // First sort by type
        if (a.type !== b.type) {
          return a.type === 'size' ? -1 : 1;
        }

        // If both are sizes, sort by size order
        if (a.type === 'size' && b.type === 'size') {
          const indexA = sizeOrder.indexOf(a.size || '');
          const indexB = sizeOrder.indexOf(b.size || '');
          
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }
          
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
        }
        
        // If both are varieties or if sorting by size failed, sort alphabetically
        return (a.variety || '').localeCompare(b.variety || '');
      });

      setStockList(organizedStocks);
      
      // Map stocks to low stock items with type assertion
      const lowStockItems = [...sizeStocks, ...varietyStocks]
        .filter(stock => stock.quantity <= stock.minimumStock)
        .map(stock => ({
          id: stock.id,
          name: stock.type === 'size' ? stock.sizeName || 'N/A' : stock.productName || 'N/A',
          currentStock: stock.quantity,
          minimumStock: stock.minimumStock,
          criticalLevel: stock.criticalLevel,
          type: stock.type,
          severity: stock.quantity <= stock.criticalLevel ? 'critical' : 'low',
          varieties: []
        } as LowStockItem));

      setLowStockItems(lowStockItems);
      
      // Update out of stock items
      const outOfStock = organizedStocks.filter(stock => 
        stock.type === 'size' ? stock.quantity === 0 : stock.totalSlices === 0
      );
      setOutOfStockItems(outOfStock);
    } catch (error) {
      console.error("Error fetching stock list:", error);
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Failed to fetch stock list",
        type: 'error',
        createdAt: new Date()
      }]);
    }
  };

  const checkNewOrders = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const pendingOrdersQuery = query(
        ordersRef,
        where("orderDetails.status", "in", ["Order Confirmed", "Preparing Order", "Ready for Pickup"]),
        orderBy("orderDetails.createdAt", "desc")
      );
      
      const mobileOrdersQuery = query(
        ordersRef,
        where("orderDetails.orderStatus", "in", ["Order Confirmed", "Preparing Order", "Ready for Pickup"]),
        orderBy("orderDetails.createdAt", "desc")
      );
      
      const [snapshot, mobileSnapshot] = await Promise.all([
        getDocs(pendingOrdersQuery),
        getDocs(mobileOrdersQuery)
      ]);
      
      // Create a map of current order statuses
      const currentOrders = new Map();
      
      // Process orders with orderDetails.status
      snapshot.docs.forEach(doc => {
        const orderData = doc.data() as OrderData;
        const orderId = doc.id;
        let customerName;
        
        // Check if it's a walk-in order
        if (orderData.orderType === "walk-in") {
          customerName = orderData.customerName || "Walk-in Customer";
        } else {
          // For registered users
          customerName = orderData.userDetails?.firstName && orderData.userDetails?.lastName
            ? `${orderData.userDetails.firstName} ${orderData.userDetails.lastName}`
            : orderData.customerName || "Customer";
        }
        
        const status = orderData.orderDetails.status;
        const message = `Order #${orderId.slice(0, 6)} - ${customerName} (${status})`;
        
        currentOrders.set(orderId, {
          id: `order-${orderId}`,
          message,
          type: 'warning',
          orderId,
          createdAt: new Date(orderData.orderDetails.createdAt),
          isOrderNotification: true
        });
      });
      
      // Process orders with orderDetails.orderStatus
      mobileSnapshot.docs.forEach(doc => {
        const orderData = doc.data() as OrderData;
        const orderId = doc.id;
        
        // Skip if we already processed this order
        if (currentOrders.has(orderId)) return;
        
        let customerName;
        
        // Check if it's a walk-in order
        if (orderData.orderType === "walk-in") {
          customerName = orderData.customerName || "Walk-in Customer";
        } else {
          // For registered users
          customerName = orderData.userDetails?.firstName && orderData.userDetails?.lastName
            ? `${orderData.userDetails.firstName} ${orderData.userDetails.lastName}`
            : orderData.customerName || "Customer";
        }
        
        const status = orderData.orderDetails.orderStatus;
        const message = `Order #${orderId.slice(0, 6)} - ${customerName} (${status})`;
        
        currentOrders.set(orderId, {
          id: `order-${orderId}`,
          message,
          type: 'warning',
          orderId,
          createdAt: new Date(orderData.orderDetails.createdAt),
          isOrderNotification: true
        });
      });

      // Update notifications - only keep order notifications
      setNotifications(Array.from(currentOrders.values()));
      
      // Remove notifications for completed or cancelled orders
      const completedOrdersQuery = query(
        ordersRef,
        where("orderDetails.status", "in", ["Completed", "Cancelled"])
      );
      
      const completedMobileOrdersQuery = query(
        ordersRef,
        where("orderDetails.orderStatus", "in", ["Completed", "Cancelled"])
      );
      
      const [completedSnapshot, completedMobileSnapshot] = await Promise.all([
        getDocs(completedOrdersQuery),
        getDocs(completedMobileOrdersQuery)
      ]);
      
      const completedOrderIds = new Set([
        ...completedSnapshot.docs.map(doc => doc.id),
        ...completedMobileSnapshot.docs.map(doc => doc.id)
      ]);
      
      setNotifications(prev => 
        prev.filter(notification => 
          notification.isOrderNotification && 
          notification.orderId && 
          !completedOrderIds.has(notification.orderId)
        )
      );
      
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
      setNotifications(prev => [...prev, {
        id: `error-${Date.now()}`,
        message: "Logout failed. Please try again.",
        type: 'error',
        createdAt: new Date()
      }]);
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
        data: popularProducts.map(p => p.totalSlices),
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
              <p className="text-2xl font-semibold text-gray-900">
                {stockList.filter(item => {
                  const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                  return stock === 0 || stock <= item.criticalLevel || stock <= item.minimumStock;
                }).length}
              </p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                  {stockList.filter(item => {
                    const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                    return stock === 0 || stock <= item.criticalLevel;
                  }).length} Critical
                </span>
                <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                  {stockList.filter(item => {
                    const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                    return stock > item.criticalLevel && stock <= item.minimumStock;
                  }).length} Low Stock
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
                <select 
                  className="text-sm border-gray-200 rounded-lg focus:ring-blue-500"
                  value={productSortBy}
                  onChange={(e) => {
                    setProductSortBy(e.target.value as 'quantity' | 'revenue');
                    fetchPopularProducts();
                  }}
                >
                  <option value="quantity">By Quantity</option>
                  <option value="revenue">By Revenue</option>
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
                      },
                      ticks: {
                        callback: function(value) {
                          if (productSortBy === 'revenue') {
                            return '₱' + value.toLocaleString();
                          }
                          return value;
                        }
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
                      {stockList.filter(item => {
                        const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                        return stock === 0 || stock <= item.criticalLevel;
                      }).length} Critical
                    </span>
                    <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                      {stockList.filter(item => {
                        const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                        return stock > item.criticalLevel && stock <= item.minimumStock;
                      }).length} Low Stock
                    </span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
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
                    {stockList
                      .filter(item => {
                        const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                        return stock === 0 || stock <= item.criticalLevel || stock <= item.minimumStock;
                      })
                      .map((item) => {
                        const currentStock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                        const stockLabel = item.type === 'size' ? 'boxes/trays' : 'slices';
                        
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {item.type === 'size' ? 'Size' : 'Variety'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {item.type === 'size' ? item.sizeName : item.variety}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {currentStock} {stockLabel}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                currentStock === 0 ? 'bg-red-100 text-red-800' :
                                currentStock <= item.criticalLevel ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {currentStock === 0 ? 'Out of Stock' :
                                 currentStock <= item.criticalLevel ? 'Critical' :
                                 'Low Stock'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    {stockList.filter(item => {
                      const stock = item.type === 'size' ? item.quantity : (item.totalSlices || 0);
                      return stock === 0 || stock <= item.criticalLevel || stock <= item.minimumStock;
                    }).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-sm text-gray-500 text-center">
                          No stock alerts
                        </td>
                      </tr>
                    )}
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
                <div className="flex gap-2">
                  <button 
                    onClick={() => router.push('/inventory/stock-management')}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    View All
                  </button>
                </div>
              </div>
            </div>
            
            {/* Size Stocks */}
            <div className="mb-4">
              <div className="px-6 py-3 bg-gray-50">
                <h4 className="text-sm font-semibold text-gray-700">Sizes</h4>
                </div>
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Stock Level
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Status
                      </th>
                      </tr>
                    </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stockList
                      .filter(stock => stock.type === 'size')
                      .map((stock) => (
                        <tr key={stock.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap w-1/3">
                            <div className="text-sm font-medium text-gray-900">
                              {stock.sizeName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {stock.slicesPerUnit} slices per box/tray
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap w-1/3">
                            <div className="text-sm text-gray-900">
                              {stock.quantity} boxes/trays
                            </div>
                            <div className="text-xs text-gray-500">
                              Low Stock: {stock.minimumStock} boxes | Critical: {stock.criticalLevel} boxes
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap w-1/3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              stock.quantity === 0 ? 'bg-red-100 text-red-800' :
                              stock.quantity <= stock.criticalLevel ? 'bg-red-100 text-red-800' :
                              stock.quantity <= stock.minimumStock ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {stock.quantity === 0 ? 'Out of Stock' :
                               stock.quantity <= stock.criticalLevel ? 'Critical' :
                               stock.quantity <= stock.minimumStock ? 'Low Stock' :
                               'In Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            {/* Variety Stocks */}
            <div>
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700">Varieties</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Variety
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Stock Level
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stockList
                      .filter(stock => stock.type === 'variety')
                      .map((stock) => {
                        const slices = stock.totalSlices || 0;
                        return (
                          <tr key={stock.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap w-1/3">
                              <div className="text-sm font-medium text-gray-900">
                                {stock.variety}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap w-1/3">
                              <div className="text-sm text-gray-900">
                                {slices} slices
                              </div>
                              <div className="text-xs text-gray-500">
                                Low Stock: {stock.minimumStock} | Critical: {stock.criticalLevel}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap w-1/3">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                slices === 0 ? 'bg-red-100 text-red-800' :
                                slices <= stock.criticalLevel ? 'bg-red-100 text-red-800' :
                                slices <= stock.minimumStock ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {slices === 0 ? 'Out of Stock' :
                                 slices <= stock.criticalLevel ? 'Critical' :
                                 slices <= stock.minimumStock ? 'Low Stock' :
                                 'In Stock'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
        </div>

        {/* Notification Panel */}
        {showNotifications && (
          <div className="fixed top-20 right-6 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                <span className="text-xs text-gray-500">
                  {notifications.filter(n => n.isOrderNotification).length} Orders | 
                  {notifications.filter(n => !n.isOrderNotification).length} Alerts
                </span>
              </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                <div>
                  {/* Order Notifications */}
                  {notifications.filter(n => n.isOrderNotification).length > 0 && (
                    <div className="p-2 bg-gray-50">
                      <h4 className="text-xs font-medium text-gray-500 uppercase">Pending Orders</h4>
                    </div>
                  )}
                  {notifications
                    .filter(n => n.isOrderNotification)
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .map((notification) => (
                      <div 
                        key={notification.id}
                        className="p-4 border-b border-gray-100 bg-yellow-50 cursor-pointer hover:bg-yellow-100"
                        onClick={() => router.push(`/orders/tracking-orders?id=${notification.orderId}`)}
                      >
                        <p className="text-sm text-yellow-800">{notification.message}</p>
                        <p className="text-xs text-yellow-600 mt-1">
                          {notification.createdAt.toLocaleTimeString()}
                        </p>
                      </div>
                    ))}
                  
                  {/* Other Notifications */}
                  {notifications.filter(n => !n.isOrderNotification).length > 0 && (
                    <div className="p-2 bg-gray-50">
                      <h4 className="text-xs font-medium text-gray-500 uppercase">Stock Alerts</h4>
                    </div>
                  )}
                  {notifications
                    .filter(n => !n.isOrderNotification)
                    .map((notification, index) => (
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
                ))}
              </div>
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
