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
import { Size, sizeConfigs } from "@/app/constants/sizeConfigs";

// Add the VARIETIES constant at the top level
const VARIETIES = [
    'Bibingka',
    'Sapin-Sapin',
    'Kutsinta',
    'Kalamay',
    'Cassava'
] as const;

interface Size {
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
    totalAmount: number;
    paymentMethod: string;
    paymentStatus?: string;
    gcashReference?: string;
    createdAt: string;
    updatedAt?: string;
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
}

export default function TrackingOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();
  
  // Define status flow at component level
  const statusFlow = [
    "Order Confirmed",
    "Preparing Order",
    "Ready for Pickup",
    "Completed"
  ];

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

      // Create tracking order data without userId if it's undefined
      const trackingOrderData: Omit<TrackingOrder, 'userId'> = {
        orderId: order.id,
        customerName: order.userDetails ? 
          `${order.userDetails.firstName} ${order.userDetails.lastName}` : 
          "Walk-in Customer",
        items: order.items.map(item => ({
          productSize: item.productSize,
          productVarieties: item.productVarieties || [],
          productQuantity: item.productQuantity,
          productPrice: item.productPrice
        })),
        paymentMethod: order.orderDetails.paymentMethod,
        paymentStatus: order.orderDetails.paymentStatus || "Pending",
        orderStatus: order.orderDetails.status || "Order Placed",
        pickupTime: order.orderDetails.pickupTime,
        pickupDate: order.orderDetails.pickupDate,
        totalAmount: order.orderDetails.totalAmount,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // Only add userId if it exists
      const trackingOrder = order.userId 
        ? { ...trackingOrderData, userId: order.userId }
        : trackingOrderData;

      if (querySnapshot.empty) {
        // Create new tracking order
        await addDoc(trackingOrdersRef, trackingOrder);
      } else {
        // Update existing tracking order
        const trackingOrderDoc = querySnapshot.docs[0];
        await updateDoc(trackingOrderDoc.ref, {
          ...trackingOrder,
          updatedAt: Timestamp.now()
        });
      }

      console.log("Order tracking updated successfully!");
    } catch (error) {
      console.error("Error saving tracking order:", error);
      throw error; // Propagate the error
    }
  };

  // Real-time orders subscription
  useEffect(() => {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, orderBy("orderDetails.createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const orderList = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
            const userDetails = await fetchUserDetails(data.userId);
            return {
              id: doc.id,
              ref: doc.ref,
              ...data,
              userDetails,
            } as Order;
          })
        );
        // Filter orders to exclude pending payments
        const filteredOrders = orderList.filter(order => {
          // For GCash payments, only show if payment is approved
          if (order.orderDetails.paymentMethod === 'GCash') {
            return order.orderDetails.paymentStatus === 'approved';
          }
          // For non-GCash payments, show all orders except pending ones
          return order.orderDetails.paymentStatus !== 'pending';
        });

        // Save filtered orders to tracking_orders collection
        await Promise.all(filteredOrders.map(order => saveTrackingOrder(order)));

        setOrders(filteredOrders);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching orders:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const orderDoc = await getDoc(orderRef);

      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const order = { id: orderDoc.id, ...orderDoc.data() } as Order;

      await runTransaction(db, async (transaction) => {
        // STEP 1: Perform all reads first
        const stockUpdates: StockUpdate[] = [];
        
        // Read tracking order document
        const trackingOrdersRef = collection(db, "tracking_orders");
        const trackingQuery = query(trackingOrdersRef, where("orderId", "==", orderId));
        const trackingDocs = await getDocs(trackingQuery);

        // If completing order, read daily sales document first
        let dailySalesDoc = undefined;
        if (newStatus === "Completed") {
          const today = new Date();
          const dateString = today.toISOString().split('T')[0];
          const dailySalesRef = doc(collection(db, "daily_sales"), dateString);
          dailySalesDoc = await transaction.get(dailySalesRef);
        }

        if (newStatus === "Ready for Pickup") {
          // Read all necessary stock documents first
          for (const item of order.items) {
            // Normalize the size name to match sizeConfigs format
            const normalizedSize = item.productSize.replace(/-/g, ' ').trim();
            
            // Check size stock first
            const sizeStocksRef = collection(db, "sizeStocks");
            const sizeStockQuery = query(
              sizeStocksRef,
              where("type", "==", "size"),
              where("size", "==", normalizedSize)
            );
            const sizeSnapshot = await getDocs(sizeStockQuery);
            const sizeStock = sizeSnapshot.docs[0];

            if (!sizeStock) {
              // Double check with sizeConfigs to provide better error message
              const validSize = sizeConfigs.find(s => s.name.toLowerCase() === normalizedSize.toLowerCase());
              if (validSize) {
                throw new Error(`No stock found for size: ${validSize.name}. Please add stock for this size in Stock Management.`);
              } else {
                throw new Error(`Invalid size: ${item.productSize}. This size is not configured in the system.`);
              }
            }

            const sizeStockData = sizeStock.data();
            if (sizeStockData.slices < item.productQuantity) {
              throw new Error(`Insufficient ${normalizedSize} stock. Available: ${sizeStockData.slices}, Needed: ${item.productQuantity}`);
            }

            // Get size configuration for slice calculation
            const sizeConfig = sizeConfigs.find(size => 
              size.name.toLowerCase() === normalizedSize.toLowerCase()
            );
            
            if (!sizeConfig) {
              throw new Error(`Size configuration not found for ${normalizedSize}. Available sizes: ${sizeConfigs.map(s => s.name).join(', ')}`);
            }

            // Calculate slices needed per variety
            const slicesPerVariety = Math.floor(sizeConfig.totalSlices / item.productVarieties.length);
            const totalSlicesNeeded = slicesPerVariety * item.productQuantity;

            // Check variety stocks
            const varietyStocksRef = collection(db, "varietyStocks");
            const varietyStockQuery = query(
              varietyStocksRef,
              where("type", "==", "variety")
            );
            const varietySnapshot = await getDocs(varietyStockQuery);
            
            // Find and validate stocks for each variety
            for (const variety of item.productVarieties) {
              const correctVariety = VARIETIES.find(
                (v: string) => v.toLowerCase() === variety.toLowerCase()
              );
              
              if (!correctVariety) {
                throw new Error(`Invalid variety name: ${variety}`);
              }

              const varietyStock = varietySnapshot.docs.find(doc => {
                const data = doc.data();
                return data.variety?.toLowerCase() === correctVariety.toLowerCase();
              });

              if (!varietyStock) {
                throw new Error(`No stock found for variety: ${variety}`);
              }

              const varietyData = varietyStock.data();
              if (varietyData.slices < totalSlicesNeeded) {
                throw new Error(`Insufficient slices for variety: ${varietyData.variety}. Available: ${varietyData.slices}, Needed: ${totalSlicesNeeded}`);
              }

              // Store the update information for later
              stockUpdates.push({
                ref: varietyStock.ref,
                data: varietyData,
                quantity: totalSlicesNeeded,
                variety: correctVariety,
                isSize: false
              });
            }

            // Store size stock update
            stockUpdates.push({
              ref: sizeStock.ref,
              data: sizeStockData,
              quantity: item.productQuantity,
              size: item.productSize,
              isSize: true
            });
          }
        }

        // STEP 2: Perform all writes after all reads are complete
        if (newStatus === "Ready for Pickup") {
          // Update all stocks
          for (const update of stockUpdates) {
            if (update.isSize) {
              // Update size stock
              const newQuantity = update.data.slices - update.quantity;
              
              transaction.update(update.ref, {
                slices: newQuantity,
                lastUpdated: new Date().toISOString()
              });

              // Create size stock history record
              const historyRef = doc(collection(db, "stockHistory"));
              transaction.set(historyRef, {
                stockId: update.ref.id,
                size: update.size,
                variety: "",
                type: "out",
                slices: update.quantity,
                previousSlices: update.data.slices,
                newSlices: newQuantity,
                date: new Date(),
                updatedBy: "Order System",
                remarks: `Order ${orderId} ready for pickup - Deducted ${update.quantity} ${update.size}`,
                isDeleted: false
              });
            } else {
              // Update variety stock
              const newQuantity = update.data.slices - update.quantity;
              
              transaction.update(update.ref, {
                slices: newQuantity,
                lastUpdated: new Date().toISOString()
              });

              // Create variety stock history record
              const historyRef = doc(collection(db, "stockHistory"));
              transaction.set(historyRef, {
                stockId: update.ref.id,
                size: "",
                variety: update.variety,
                type: "out",
                slices: update.quantity,
                previousSlices: update.data.slices,
                newSlices: newQuantity,
                date: new Date(),
                updatedBy: "Order System",
                remarks: `Order ${orderId} ready for pickup - Deducted ${update.quantity} slices`,
                isDeleted: false
              });
            }
          }
        }

        // Update order status
        transaction.update(orderRef, {
          "orderDetails.status": newStatus,
          "orderDetails.updatedAt": new Date().toISOString(),
          ...(newStatus === "Completed" ? {
            "orderDetails.completedAt": new Date().toISOString()
          } : {})
        });

        // Update tracking order if exists
        if (trackingDocs.size > 0) {
          const trackingDoc = trackingDocs.docs[0];
          transaction.update(trackingDoc.ref, {
            orderStatus: newStatus,
            updatedAt: Timestamp.now()
          });
        }

        // If order is completed, record the sale
        if (newStatus === "Completed") {
          // Create sales record
          const salesRef = doc(collection(db, "sales"));
          transaction.set(salesRef, {
            orderId: orderId,
            customerName: order.userDetails 
              ? `${order.userDetails.firstName} ${order.userDetails.lastName}` 
              : "Walk-in Customer",
            items: order.items.map(item => ({
              size: item.productSize,
              varieties: item.productVarieties || [],
              quantity: item.productQuantity,
              price: item.productPrice,
              subtotal: item.productQuantity * item.productPrice
            })),
            totalAmount: order.orderDetails.totalAmount,
            paymentMethod: order.orderDetails.paymentMethod,
            paymentStatus: order.orderDetails.paymentStatus || "Completed",
            orderDate: order.orderDetails.createdAt,
            completedDate: new Date().toISOString(),
            status: "Completed",
            date: new Date()
          });

          // Update daily sales
          const today = new Date();
          const dateString = today.toISOString().split('T')[0];
          const dailySalesRef = doc(collection(db, "daily_sales"), dateString);
          
          if (dailySalesDoc && dailySalesDoc.exists()) {
            const currentData = dailySalesDoc.data();
            transaction.update(dailySalesRef, {
              totalAmount: (currentData.totalAmount || 0) + order.orderDetails.totalAmount,
              orderCount: (currentData.orderCount || 0) + 1,
              lastUpdated: new Date().toISOString(),
              orders: [...(currentData.orders || []), {
                orderId: orderId,
                amount: order.orderDetails.totalAmount,
                customerName: order.userDetails 
                  ? `${order.userDetails.firstName} ${order.userDetails.lastName}` 
                  : "Walk-in Customer",
                completedAt: new Date().toISOString(),
                items: order.items.map(item => ({
                  size: item.productSize,
                  varieties: item.productVarieties || [],
                  quantity: item.productQuantity,
                  price: item.productPrice,
                  subtotal: item.productQuantity * item.productPrice
                }))
              }]
            });
          } else {
            transaction.set(dailySalesRef, {
              date: dateString,
              totalAmount: order.orderDetails.totalAmount,
              orderCount: 1,
              lastUpdated: new Date().toISOString(),
              orders: [{
                orderId: orderId,
                amount: order.orderDetails.totalAmount,
                customerName: order.userDetails 
                  ? `${order.userDetails.firstName} ${order.userDetails.lastName}` 
                  : "Walk-in Customer",
                completedAt: new Date().toISOString(),
                items: order.items.map(item => ({
                  size: item.productSize,
                  varieties: item.productVarieties || [],
                  quantity: item.productQuantity,
                  price: item.productPrice,
                  subtotal: item.productQuantity * item.productPrice
                }))
              }]
            });
          }
        }
      });

      alert(newStatus === "Completed" 
        ? "Order completed and sales recorded successfully!" 
        : "Order status updated successfully!");
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(error instanceof Error ? error.message : "Failed to update order status");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.userDetails &&
        `${order.userDetails.firstName} ${order.userDetails.lastName}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const getStatusColor = (status: string | undefined) => {
    if (!status) return "bg-gray-100 text-gray-800";
    switch (status.toLowerCase()) {
      case "order placed":
        return "bg-blue-100 text-blue-800";
      case "order confirmed":
        return "bg-purple-100 text-purple-800";
      case "preparing order":
        return "bg-yellow-100 text-yellow-800";
      case "ready for pickup":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-green-100 text-green-800";
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

  const getAvailableStatuses = (currentStatus: string) => {
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex === -1) return statusFlow; // Return all statuses if not found
    
    // Return all statuses, but we'll disable the previous ones in the dropdown
    return statusFlow;
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">
              Order Tracking
            </h1>
            <div className="w-full md:w-auto">
              <input
                type="text"
                placeholder="Search by Order ID or Customer Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-96 border p-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto w-full">
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
                            value={order.orderDetails.status}
                            onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                            className={`px-2 py-1 rounded text-sm ${getStatusColor(order.orderDetails.status)} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                          >
                            {getAvailableStatuses(order.orderDetails.status).map((status) => (
                              <option 
                                key={status} 
                                value={status}
                                disabled={statusFlow.indexOf(status) < statusFlow.indexOf(order.orderDetails.status)}
                              >
                                {status}
                              </option>
                            ))}
                            <option value="Cancelled">Cancelled</option>
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