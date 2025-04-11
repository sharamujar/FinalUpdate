"use client";

import { useRouter } from "next/navigation";
import { db } from "@/app/firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  doc,
  updateDoc,
  DocumentReference,
  addDoc,
  getDocs,
  where,
  runTransaction,
  Timestamp,
  FieldValue,
  DocumentData
} from "firebase/firestore";
import Sidebar from "@/app/components/Sidebar";

// Import size configurations
import { sizeConfigs } from "@/app/constants/sizeConfigs";

// Add the VARIETIES constant at the top level
const VARIETIES = [
    'Bibingka',
    'Sapin-Sapin',
    'Kutsinta',
    'Kalamay',
    'Cassava'
] as const;

interface SizeConfig {
    id: string;
    name: string;
    price: number;
    maxVarieties: number;
    minVarieties: number;
    totalSlices: number;
    allowedVarieties?: string[];
    excludedVarieties?: string[];
    boxPrice?: number;
    description: string;
}

interface StockUpdate {
    ref: DocumentReference;
    data: DocumentData & {
        slices: number;
        variety?: string;
        size?: string;
    };
    quantity: number;
    variety?: string;
    size?: string;
    isSize: boolean;
}

interface VarietyCombination {
  varieties: string[];
  quantity: number;
}

interface StockData {
  id: string;
  sizeId: string;
  sizeName: string;
  combinations: VarietyCombination[];
  totalQuantity: number;
  lastUpdated: Date;
}

interface Order {
  id: string;
  userId?: string;
  userDetails?: {
    firstName: string;
    lastName: string;
  };
  orderDetails: {
    pickupTime: string;
    pickupDate: string;
    status: string;
    orderStatus?: string;
    totalAmount: number;
    paymentMethod: string;
    paymentStatus?: string;
    gcashReference?: string;
    createdAt: string;
    updatedAt?: string;
    isScheduled?: boolean;
  };
  items: Array<{
    cartId: string;
    productSize: string;
    productVarieties: string[];
    productQuantity: number;
    productPrice: number;
  }>;
  ref?: DocumentReference;
}

interface TrackingOrder {
  orderId: string;
  userId?: string;
  customerName: string;
  items: Array<{
    productSize: string;
    productVarieties: string[];
    productQuantity: number;
    productPrice: number;
  }>;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  pickupTime: string;
  pickupDate: string;
  totalAmount: number;
  createdAt: FieldValue;
  updatedAt: FieldValue;
  isScheduled: boolean;
  reservedStockIds: string[];
}

import {
  reserveStock,
  updateReservedStock,
  releaseReservedStock,
  SCHEDULED_STATUS_FLOW
} from "@/app/utils/scheduledOrders";

// Define status flows
const regularStatusFlow = [
  "Order Confirmed",
  "Preparing Order",
  "Ready for Pickup",
  "Completed"
] as const;

// Define the status types
type RegularStatus = typeof regularStatusFlow[number];
type ScheduledStatus = typeof SCHEDULED_STATUS_FLOW[number];
type OrderStatus = RegularStatus | ScheduledStatus;

export default function TrackingOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showScheduled, setShowScheduled] = useState(false);
  const router = useRouter();

  // Function to fetch user details
  const fetchUserDetails = async (userId: string | undefined) => {
    try {
      if (!userId) {
        return null;
      }

      const userRef = doc(db, "customers", userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.name) {
          const nameParts = data.name.split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || "N/A";
          return {
            firstName,
            lastName,
          };
        } else {
          return {
            firstName: data.firstName || "N/A",
            lastName: data.lastName || "N/A",
          };
        }
      }
      return null;
    } catch (error) {
      console.error("Error fetching user details:", error);
      return null;
    }
  };

  // Function to save tracking order to Firestore
  const saveTrackingOrder = async (order: Order) => {
    try {
      // Check if tracking order already exists
      const trackingOrdersRef = collection(db, "tracking_orders");
      const q = query(trackingOrdersRef, where("orderId", "==", order.id));
      const querySnapshot = await getDocs(q);

      // Set initial status
      const initialStatus = order.orderDetails.status || "Order Confirmed";
      let reservedStockIds: string[] = [];

      // Check if it's a scheduled order
      const isScheduled = new Date(order.orderDetails.pickupDate) > new Date();
      
      // If it's a scheduled order and no tracking order exists, reserve the stock
      if (isScheduled && !querySnapshot.docs.length) {
        reservedStockIds = await reserveStock(
          order.id,
          order.items,
          order.orderDetails.pickupDate,
          order.orderDetails.pickupTime
        );
      }

      // Update the original order status if it's a new order
      if (!order.orderDetails.status && !order.orderDetails.orderStatus) {
        await updateDoc(order.ref!, {
          "orderDetails.status": initialStatus,
          "orderDetails.orderStatus": initialStatus,
          "orderDetails.updatedAt": new Date().toISOString(),
          "orderDetails.isScheduled": isScheduled
        });
      }

      if (!querySnapshot.docs.length) {
        // Create new tracking order
        const trackingOrderData = {
        orderId: order.id,
        customerName: order.userDetails ? 
          `${order.userDetails.firstName} ${order.userDetails.lastName}` : 
          "Walk-in Customer",
          items: order.items,
        paymentMethod: order.orderDetails.paymentMethod,
        paymentStatus: order.orderDetails.paymentStatus || "pending",
          orderStatus: initialStatus,
        pickupTime: order.orderDetails.pickupTime,
        pickupDate: order.orderDetails.pickupDate,
        totalAmount: order.orderDetails.totalAmount,
        createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          isScheduled,
          reservedStockIds
        };

        await addDoc(trackingOrdersRef, trackingOrderData);
      }
    } catch (error) {
      console.error("Error saving tracking order:", error);
      throw error;
    }
  };

  // Real-time orders subscription
  useEffect(() => {
    setLoading(true);
    let unsubscribeOrders: () => void;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to orders collection
    const ordersRef = collection(db, "orders");
        const ordersQuery = query(
          ordersRef,
          orderBy("orderDetails.createdAt", "desc")
        );

        unsubscribeOrders = onSnapshot(ordersQuery, async (snapshot) => {
          try {
            console.log("Received orders snapshot with", snapshot.docs.length, "documents");
            
        const orderList = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
                console.log("Processing order:", doc.id, data);
                
                // Initialize status if not present
                if (!data.orderDetails?.status) {
                  const orderRef = doc.ref;
                  const initialStatus = "Order Confirmed";
                  
                  // Check if pickup date is for a future day
                  const orderDate = new Date(data.orderDetails.createdAt);
                  const pickupDate = new Date(data.orderDetails.pickupDate);
                  
                  // Set to start of day for comparison
                  orderDate.setHours(0, 0, 0, 0);
                  pickupDate.setHours(0, 0, 0, 0);
                  
                  const isScheduled = pickupDate.getTime() > orderDate.getTime();
                  
                  await updateDoc(orderRef, {
                    "orderDetails.status": initialStatus,
                    "orderDetails.orderStatus": initialStatus,
                    "orderDetails.updatedAt": new Date().toISOString(),
                    "orderDetails.isScheduled": isScheduled
                  });
                  
                  data.orderDetails = {
                    ...data.orderDetails,
                    status: initialStatus,
                    orderStatus: initialStatus,
                    isScheduled
                  };
                }

            const userDetails = await fetchUserDetails(data.userId);
            return {
              id: doc.id,
              ref: doc.ref,
              ...data,
              userDetails,
            } as Order;
          })
        );

            console.log("Processed orders:", orderList);
            setOrders(orderList);
            setLoading(false);
          } catch (error) {
            console.error("Error processing orders:", error);
            setLoading(false);
          }
        }, (error) => {
          console.error("Error in orders subscription:", error);
          setLoading(false);
        });

      } catch (error) {
        console.error("Error setting up subscriptions:", error);
        setLoading(false);
      }
    };

    setupSubscriptions();

    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, []);

  // Function to handle status updates
  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const trackingOrdersRef = collection(db, "tracking_orders");
      const q = query(trackingOrdersRef, where("orderId", "==", orderId));

      await runTransaction(db, async (transaction) => {
        // Get the order document
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists()) {
          throw new Error("Order not found");
        }

        const orderData = orderDoc.data();
        const isScheduled = orderData.orderDetails?.isScheduled;

        // Update order status
        transaction.update(orderRef, {
          "orderDetails.status": newStatus,
          "orderDetails.orderStatus": newStatus,
          "orderDetails.updatedAt": new Date().toISOString()
        });

        // Update tracking order status
        const trackingSnapshot = await getDocs(q);
        trackingSnapshot.docs.forEach((doc) => {
          transaction.update(doc.ref, {
            orderStatus: newStatus,
            updatedAt: Timestamp.now()
          });
        });

        // Handle reserved stock updates for scheduled orders
        if (isScheduled) {
          if (newStatus === "Completed") {
            // Release reserved stock and deduct from actual inventory
            await releaseReservedStock(orderId, newStatus);
            // Handle inventory deduction here
            await handleInventoryDeduction(orderData.items);
          } else {
            // Update reserved stock status
            await updateReservedStock(orderId, newStatus);
          }
        } else if (newStatus === "Completed") {
          // For regular orders, just deduct from inventory
          await handleInventoryDeduction(orderData.items);
        }
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      throw error;
    }
  };

  // Function to handle inventory deduction
  const handleInventoryDeduction = async (items: any[]) => {
    try {
      await runTransaction(db, async (transaction) => {
        // STEP 1: Perform all reads first
        const stockUpdates: StockUpdate[] = [];
        
        for (const item of items) {
          // Calculate total slices needed for this item
          const sizeConfig = sizeConfigs.find(s => s.name === item.productSize);
          if (!sizeConfig) continue;
          
          const totalSlicesNeeded = sizeConfig.totalSlices * item.productQuantity;
          const slicesPerVariety = totalSlicesNeeded / item.productVarieties.length;

          // Check and update stock for each variety
          for (const variety of item.productVarieties) {
            const varietyStockRef = doc(collection(db, "varietyStocks"), variety);
            const varietyStock = await transaction.get(varietyStockRef);
            
            if (!varietyStock.exists()) {
              throw new Error(`Stock not found for variety: ${variety}`);
            }

            const varietyData = varietyStock.data() as DocumentData & {
              slices: number;
              variety?: string;
            };

            if (varietyData.slices < slicesPerVariety) {
              throw new Error(`Insufficient slices for variety: ${variety}`);
            }

            // Store the update for later
            stockUpdates.push({
              ref: varietyStock.ref,
              data: varietyData,
              quantity: slicesPerVariety,
              variety,
              isSize: false
            });
          }
        }
        
        // STEP 2: Perform all updates
        for (const update of stockUpdates) {
          transaction.update(update.ref, {
            slices: update.data.slices - update.quantity
          });
        }
      });
    } catch (error) {
      console.error("Error deducting inventory:", error);
      throw error;
    }
  };

  // Filter orders based on scheduled status and search term
  const filteredOrders = orders.filter((order) => {
    console.log("Filtering order:", order.id, {
      isScheduled: order.orderDetails.isScheduled,
      showScheduled,
      paymentMethod: order.orderDetails.paymentMethod,
      paymentStatus: order.orderDetails.paymentStatus,
      createdAt: order.orderDetails.createdAt,
      pickupDate: order.orderDetails.pickupDate
    });

    // Only filter GCash payments that need approval
    const paymentValid = 
      order.orderDetails.paymentMethod?.toLowerCase() !== 'gcash' ||
      order.orderDetails.paymentStatus === 'approved';

    // Check if order matches search term
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.userDetails &&
        `${order.userDetails.firstName} ${order.userDetails.lastName}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()));

    // Check if order is scheduled based on pickup date
    const orderDate = new Date(order.orderDetails.createdAt);
    const pickupDate = new Date(order.orderDetails.pickupDate);
    
    // Set to start of day for comparison
    orderDate.setHours(0, 0, 0, 0);
    pickupDate.setHours(0, 0, 0, 0);
    
    const isScheduled = pickupDate.getTime() > orderDate.getTime();
    
    // Update the order's isScheduled flag if it doesn't match our calculation
    if (order.orderDetails.isScheduled !== isScheduled && order.ref) {
      updateDoc(order.ref, {
        "orderDetails.isScheduled": isScheduled
      }).catch(error => console.error("Error updating isScheduled flag:", error));
    }

    // Check scheduled status - if showScheduled is true, show scheduled orders, otherwise show non-scheduled
    const matchesScheduled = showScheduled ? isScheduled : !isScheduled;

    return paymentValid && matchesSearch && matchesScheduled;
  });

  // Get available statuses based on current status and order type
  const getAvailableStatuses = (currentStatus: string, isScheduled: boolean): OrderStatus[] => {
    if (isScheduled) {
      const currentIndex = SCHEDULED_STATUS_FLOW.indexOf(currentStatus as ScheduledStatus);
      return currentIndex >= 0 ? SCHEDULED_STATUS_FLOW.slice(currentIndex + 1) as OrderStatus[] : [];
    } else {
      const currentIndex = regularStatusFlow.indexOf(currentStatus as RegularStatus);
      return currentIndex >= 0 ? regularStatusFlow.slice(currentIndex + 1) as OrderStatus[] : [];
    }
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) return "bg-gray-100 text-gray-800";
    switch (status.toLowerCase()) {
      case "order confirmed":
        return "bg-blue-100 text-blue-800";
      case "stock reserved":
        return "bg-indigo-100 text-indigo-800";
      case "preparing order":
        return "bg-yellow-100 text-yellow-800";
      case "ready for pickup":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentMethodBadge = (paymentMethod: string, paymentStatus?: string) => {
    if (paymentMethod === 'GCash') {
      return paymentStatus === 'approved' 
        ? 'bg-green-100 text-green-800' 
        : 'bg-yellow-100 text-yellow-800';
    }
    return 'bg-blue-100 text-blue-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            <div className="mb-4 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {showScheduled ? 'Scheduled Orders' : 'Today\'s Orders'}
            </h1>
                <button
                  onClick={() => setShowScheduled(!showScheduled)}
                  className={`px-4 py-2 rounded-lg ${
                    showScheduled
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {showScheduled ? 'View Today\'s Orders' : 'View Scheduled Orders'}
                </button>
              </div>
              <div className="flex items-center space-x-4">
              <input
                type="text"
                  placeholder="Search orders..."
                  className="px-4 py-2 border rounded-lg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

            {/* Orders Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            #{order.id.slice(0, 6)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDate(order.orderDetails.createdAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {order.userDetails
                              ? `${order.userDetails.firstName} ${order.userDetails.lastName}`.trim()
                              : order.userId ? "Loading..." : "Walk-in Customer"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {order.items.map((item, index) => (
                              <div key={item.cartId} className="mb-2">
                                <div className="font-medium">Size: {item.productSize}</div>
                                <div>Varieties: {item.productVarieties.join(", ")}</div>
                                <div>Quantity: {item.productQuantity}</div>
                                <div>Price: ₱{item.productPrice.toLocaleString()}</div>
                                {index < order.items.length - 1 && <hr className="my-1" />}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodBadge(order.orderDetails.paymentMethod, order.orderDetails.paymentStatus)}`}>
                            {order.orderDetails.paymentMethod}
                            {order.orderDetails.paymentMethod === 'GCash' && order.orderDetails.paymentStatus === 'approved' && ' (Approved)'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            className={`text-sm border rounded-md px-3 py-1 ${getStatusColor(order.orderDetails.status)}`}
                            onChange={(e) => handleStatusUpdate(order.id, e.target.value as OrderStatus)}
                            value={order.orderDetails.status}
                          >
                            <option value={order.orderDetails.status} disabled>
                              {order.orderDetails.status}
                            </option>
                            {getAvailableStatuses(
                              order.orderDetails.status,
                              order.orderDetails.isScheduled || false
                            ).map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => router.push(`/orders/${order.id}`)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 