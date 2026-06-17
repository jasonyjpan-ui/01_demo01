import type { MenuItem, Order } from "../../shared/contracts";

interface StaleItem {
  id: number;
  name: string;
  orderedPrice: number;
  currentPrice?: number;
  reason: string;
}

interface CartValidationProps {
  order: Order | null;
  menu: MenuItem[];
  onRemoveStaleItems?: () => void;
  onRefreshMenu?: () => void;
}

export function CartValidation({ order, menu, onRemoveStaleItems, onRefreshMenu }: CartValidationProps) {
  if (!order || order.items.length === 0) {
    return null;
  }

  // 檢測失效項目（版本不匹配或價格變動）
  const staleItems: StaleItem[] = [];
  const priceChangedItems: Array<StaleItem & { newPrice: number }> = [];

  order.items.forEach((orderItem) => {
    const currentMenu = menu.find((m) => m.id === orderItem.item.id);

    if (!currentMenu) {
      // 菜單項目已被刪除
      staleItems.push({
        id: orderItem.item.id,
        name: orderItem.item.name,
        orderedPrice: orderItem.item.price,
        reason: "菜單項目已不存在",
      });
    } else if (currentMenu.version !== orderItem.item.version) {
      // 版本不匹配 - 價格可能變動
      if (currentMenu.price !== orderItem.item.price) {
        priceChangedItems.push({
          id: orderItem.item.id,
          name: orderItem.item.name,
          orderedPrice: orderItem.item.price,
          currentPrice: currentMenu.price,
          newPrice: currentMenu.price,
          reason: currentMenu.changeReason || "菜單已更新",
        });
      } else {
        // 版本變但價格未變（其他欄位變更）
        staleItems.push({
          id: orderItem.item.id,
          name: orderItem.item.name,
          orderedPrice: orderItem.item.price,
          currentPrice: currentMenu.price,
          reason: currentMenu.changeReason || "菜單已更新",
        });
      }
    }
  });

  // 如果沒有問題，不顯示
  if (staleItems.length === 0 && priceChangedItems.length === 0) {
    return null;
  }

  return (
    <div className="cart-validation">
      {/* 價格變動提示 */}
      {priceChangedItems.length > 0 && (
        <div className="price-change-alert alert-warning">
          <div className="alert-title">💰 價格變動提示</div>
          <div className="alert-content">
            <p>您的購物車中有項目價格已變動：</p>
            <ul className="price-changes-list">
              {priceChangedItems.map((item) => (
                <li key={item.id} className="price-change-item">
                  <span className="item-name">{item.name}</span>
                  <span className="price-info">
                    ¥{item.orderedPrice} → <strong>¥{item.newPrice}</strong>
                  </span>
                  <span className="price-reason">({item.reason})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 失效項目警告 */}
      {staleItems.length > 0 && (
        <div className="stale-items-alert alert-danger">
          <div className="alert-title">⚠️ 購物車失效警告</div>
          <div className="alert-content">
            <p>以下項目已不可用或已變動：</p>
            <ul className="stale-items-list">
              {staleItems.map((item) => (
                <li key={item.id} className="stale-item">
                  <span className="item-name">{item.name}</span>
                  <span className="item-reason">({item.reason})</span>
                </li>
              ))}
            </ul>
            <div className="alert-actions">
              {onRemoveStaleItems && (
                <button
                  onClick={onRemoveStaleItems}
                  className="btn btn-danger-outline"
                >
                  移除失效項目
                </button>
              )}
              {onRefreshMenu && (
                <button
                  onClick={onRefreshMenu}
                  className="btn btn-primary-outline"
                >
                  刷新菜單
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .cart-validation {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .alert-warning,
        .alert-danger {
          border-radius: 8px;
          padding: 12px;
          background-color: #f8f6f1;
          border-left: 4px solid #ff9800;
        }

        .alert-danger {
          background-color: #fef5f5;
          border-left-color: #f44336;
        }

        .alert-title {
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .alert-content {
          font-size: 13px;
          color: #555;
        }

        .alert-content p {
          margin: 0 0 8px 0;
        }

        .price-changes-list,
        .stale-items-list {
          list-style: none;
          padding: 0;
          margin: 8px 0;
        }

        .price-change-item,
        .stale-item {
          padding: 6px 8px;
          margin: 4px 0;
          background-color: rgba(255, 255, 255, 0.6);
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .item-name {
          font-weight: 500;
          color: #333;
        }

        .price-info {
          font-size: 12px;
          color: #d32f2f;
        }

        .price-reason,
        .item-reason {
          font-size: 11px;
          color: #999;
        }

        .alert-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .btn {
          padding: 6px 12px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-danger-outline {
          border: 1px solid #f44336;
          color: #f44336;
          background-color: transparent;
        }

        .btn-danger-outline:hover {
          background-color: #fde;
        }

        .btn-primary-outline {
          border: 1px solid #1976d2;
          color: #1976d2;
          background-color: transparent;
        }

        .btn-primary-outline:hover {
          background-color: #e3f2fd;
        }
      `}</style>
    </div>
  );
}
