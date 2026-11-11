# 支付代币管理

对已部署的 MarscatRecharge 合约管理支付代币：**新增**、**停用**、**查看**。所有操作由合约 owner 执行，无需改动或重新部署合约。

## 前置条件

- `.env` 中 `PRIVATE_KEY` 为当前合约 owner 的私钥
- `.env` 中 `CONTRACT_ADDRESS` 为线上合约地址

每个操作都支持 `DRY_RUN=true` 先预览、不发交易，确认无误后再正式执行。

---

## 新增支付代币

让用户可以用某种代币支付。为季度、年度套餐分别设置价格。

`.env`：

```bash
NEW_TOKEN_ADDRESS=0x...            # 新增的代币地址
NEW_TOKEN_QUARTERLY_PRICE=9.9      # 季度价格（按代币精度自动折算）
NEW_TOKEN_YEARLY_PRICE=29.9        # 年度价格
```

执行：

```bash
DRY_RUN=true npm run add-token:bsc    # 预览
npm run add-token:bsc                 # 执行
```

---

## 停用支付代币

让某种代币（如 USDT）不再可用。原理：把它的价格设为超高值，任何钱包都付不起，等同于下架。可随时用「新增」操作设回正常价格来恢复。

`.env`：

```bash
DISABLE_TOKEN_ADDRESS=0x...        # 要停用的代币地址
```

执行：

```bash
DRY_RUN=true npm run disable-token:bsc    # 预览
npm run disable-token:bsc                 # 执行
```

> 配合前端隐藏该代币入口，即可实现「切换支付代币」。

---

## 查看当前代币

查询指定代币在合约中的当前价格与状态。此操作只读，不发交易。

要查询的代币（`.env`，二选一）：

```bash
CHECK_TOKENS=0xAAA...,0xBBB...   # 逗号分隔多个地址；留空则回退下一行
# 回退：自动使用 USDT_ADDRESS + NEW_TOKEN_ADDRESS
```

执行：

```bash
npm run list-tokens:bsc
```

每个代币会标为三种状态之一：

- `[active]` 可支付，显示当前价格
- `[not accepted]` 价格为 0，未配置
- `[disabled]` 价格超高，已停用

---

## 说明

- 价格按各代币精度独立配置，合约不做汇率换算，等值由设置价格时自行保证。
- 新增支持标准 ERC20（兼容 USDT 这类非标准返回值的代币）。
- 所有写操作仅限 owner，脚本执行前会校验签名者身份，并在完成后回读链上值确认。
