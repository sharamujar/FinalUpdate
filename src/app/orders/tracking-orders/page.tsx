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
  FieldValue
} from "firebase/firestore";
import Sidebar from "@/app/components/Sidebar";

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
        paymentStatus: order.orderDetails.paymentStatus || "pending",
        orderStatus: order.orderDetails.status,
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
      console.error("Order data:", order);
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
      const order = orders.find((o) => o.id === orderId);
      if (!order?.ref) {
        console.error("No document reference found for order:", orderId);
        return;
      }

      // Start a transaction for any status update
      await runTransaction(db, async (transaction) => {
        // Get the order document reference
        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await transaction.get(orderRef);
        
        if (!orderDoc.exists()) {
          throw new Error("Order not found");
        }

        // If the new status is "Ready for Pickup", reduce stock
        if (newStatus === "Ready for Pickup") {
          // For each item in the order
          for (const item of order.items) {
            // Find the matching stock
            const stocksRef = collection(db, "stocks");
            const stockSnapshot = await getDocs(stocksRef);
            
            console.log('Looking for stock:', {
              size: item.productSize,
              varieties: item.productVarieties
            });

            // Find stock with matching size and varieties
            const matchingStock = stockSnapshot.docs.find(doc => {
              const stockData = doc.data();
              console.log('Checking stock:', {
                id: doc.id,
                sizeName: stockData.sizeName,
                combinations: stockData.combinations
              });

              // First check if size matches
              if (stockData.sizeName !== item.productSize) {
                return false;
              }

              // Then check combinations
              return stockData.combinations.some(combo => {
                // For Tray and Big Bilao, we need to check if the varieties match in any order
                if (item.productSize === "Tray" || item.productSize === "Big Bilao") {
                  // Sort both arrays to compare regardless of order
                  const sortedOrderVarieties = [...item.productVarieties].sort();
                  const sortedComboVarieties = [...combo.varieties].sort();
                  
                  console.log('Comparing varieties:', {
                    orderVarieties: sortedOrderVarieties,
                    comboVarieties: sortedComboVarieties,
                    matches: JSON.stringify(sortedOrderVarieties) === JSON.stringify(sortedComboVarieties)
                  });

                  return JSON.stringify(sortedOrderVarieties) === JSON.stringify(sortedComboVarieties);
                }
                
                // For other sizes, just check if the variety exists in the combination
                return item.productVarieties.every(v => combo.varieties.includes(v));
              });
            });

            if (!matchingStock) {
              console.error('No matching stock found. Available stocks:', 
                stockSnapshot.docs.map(doc => ({
                  id: doc.id,
                  data: doc.data()
                }))
              );
              throw new Error(`No stock found for ${item.productSize} with varieties ${item.productVarieties.join(", ")}`);
            }

            const stockData = matchingStock.data() as StockData;
            
            // Find the matching combination
            const matchingCombo = stockData.combinations.find(combo => {
              if (item.productSize === "Tray" || item.productSize === "Big Bilao") {
                // Sort both arrays to compare regardless of order
                const sortedOrderVarieties = [...item.productVarieties].sort();
                const sortedComboVarieties = [...combo.varieties].sort();
                return JSON.stringify(sortedOrderVarieties) === JSON.stringify(sortedComboVarieties);
              }
              return item.productVarieties.every(v => combo.varieties.includes(v));
            });

            if (!matchingCombo || matchingCombo.quantity < item.productQuantity) {
              throw new Error(`Insufficient stock for ${item.productSize} with varieties ${item.productVarieties.join(", ")}`);
            }

            // Update the combinations array
            const updatedCombinations = stockData.combinations.map(combo => {
              if (item.productSize === "Tray" || item.productSize === "Big Bilao") {
                // Sort both arrays to compare regardless of order
                const sortedOrderVarieties = [...item.productVarieties].sort();
                const sortedComboVarieties = [...combo.varieties].sort();
                if (JSON.stringify(sortedOrderVarieties) === JSON.stringify(sortedComboVarieties)) {
                  return {
                    ...combo,
                    quantity: combo.quantity - item.productQuantity
                  };
                }
              } else if (item.productVarieties.every(v => combo.varieties.includes(v))) {
                return {
                  ...combo,
                  quantity: combo.quantity - item.productQuantity
                };
              }
              return combo;
            });

            const newTotalQuantity = updatedCombinations.reduce((sum, combo) => sum + combo.quantity, 0);

            // Update stock document
            transaction.update(matchingStock.ref, {
              combinations: updatedCombinations,
              totalQuantity: newTotalQuantity,
              lastUpdated: new Date()
            });

            // Add stock history entry
            const historyRef = doc(collection(db, "stockHistory"));
            transaction.set(historyRef, {
              sizeId: stockData.sizeId,
              sizeName: stockData.sizeName,
              combination: {
                varieties: item.productVarieties,
                quantity: item.productQuantity
              },
              type: 'out',
              quantity: item.productQuantity,
              previousQuantity: stockData.totalQuantity,
              newQuantity: newTotalQuantity,
              date: new Date(),
              updatedBy: "Order System",
              remarks: `Order ${orderId} ready for pickup`,
              stockId: matchingStock.id,
              isDeleted: false
            });
          }
        }
        
        // If the new status is "Completed", update sales data
        if (newStatus === "Completed") {
          // Add to sales collection
          const salesRef = doc(collection(db, "sales"));
          transaction.set(salesRef, {
            orderId: orderId,
            amount: order.orderDetails.totalAmount,
            date: Timestamp.fromDate(new Date()),
            items: order.items.map(item => ({
              size: item.productSize,
              varieties: item.productVarieties,
              quantity: item.productQuantity,
              price: item.productPrice,
              subtotal: item.productQuantity * item.productPrice
            })),
            paymentMethod: order.orderDetails.paymentMethod,
            customerName: order.userDetails ? `${order.userDetails.firstName} ${order.userDetails.lastName}` : 'Unknown'
          });

          // Update inventory valuation
          // This will be reflected in the inventory reports automatically
          // through the existing queries
        }

        // Update order status
        transaction.update(orderRef, {
          "orderDetails.status": newStatus,
          "orderDetails.updatedAt": new Date().toISOString(),
          ...(newStatus === "Completed" ? {
            "orderDetails.completedAt": new Date().toISOString()
          } : {})
        });
      });

      alert(`Order ${newStatus === "Completed" ? "completed and sales updated" : "status updated"} successfully!`);
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(error instanceof Error ? error.message : "Failed to update order status.");
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