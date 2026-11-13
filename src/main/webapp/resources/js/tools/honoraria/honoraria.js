const voidBtn = `<button onclick="voidCheck('~checkNo~')" class="btn btn-primary btn-sm" style="padding:0px 5px 0px 5px;font-size:10px;" type="button">VOID</button>`;

var fileDropzone = null;
var honorariaSearchInFlight = false;
/** When true, incomplete panel stays empty until Generate completes (fulfill → batches workflow). */
var suppressIncompleteListUntilGenerate = false;
var pendingRefreshUnprocessedAfterEarned = false;
const checkDropzoneOptions = {
	dictDefaultMessage: "Drop an Excel file here or click to browse.",
	paramName: "file", // The name that will be used to transfer the file
	maxFilesize: 1, // MB
	maxFiles: 1,
	timeout: 60000,
	addRemoveLinks: true,
	acceptedFiles: ".xls,.xlsx"
	};

Dropzone.autoDiscover = false;

$(document).ready(function() {

	let today = new Date();		

	$('.input-group.date').datepicker({format: "mm/dd/yyyy"}); 
	$(".input-group.date").datepicker("setDate", today);
	$("#dueDate").datepicker("setDate", today);
	$("#fromDate").datepicker("setDate", today);
	$("#toDate").datepicker("setDate", today);
	
	$("#previousLoads").change(function() {
		getCheck();
	});	
	
	$("#voidExportBtn").click(function() {
		exportToExcel("voidSearchResultsTable", "voidedChecks");
	});
	
	$("#checkExportBtn").click(function() {
		exportToExcel("checksSearchResultsTable", "Reconciled Checks-batchId_" + $("#previousLoads").val());
	});
	
	initDropZone();	
	$("#refreshIncompleteBtn").click(function(e) {
		e.preventDefault();
		checkForIncompleteBatch();
	});
	// Clear any stuck full-page overlay or legacy disabled state on the search row
	if (typeof hideLoading === "function") {
		hideLoading();
	}
	enableSearchFilters();
	checkForIncompleteBatch();
	$(document).on("blur", "#searchResults .hon-cutoff-input", function() {
		validateCutoffInput($(this));
	});
	if ($("#SUMMARY_REPORT_TAB").hasClass("active")) {
		initSummaryReportTab();
	}
});


function escapeHtml(value) {
	if (value == null) {
		return "";
	}
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function format_business_line_finance_code(value) {
	if (value == null || String(value).trim() === "") {
		return `<span class="business_line_finance_code is-empty">Not set</span>`;
	}
	return `<span class="business_line_finance_code">${escapeHtml(value)}</span>`;
}

function setIncompleteLoadingState(message) {
	$("#incompleteResultsTableBody").html("");
	$("#incompleteTableWrap").hide();
	$("#incompleteEmptyState")
		.removeClass("is-error")
		.addClass("is-loading")
		.text(message || "Loading incomplete batches...");
	$("#incompleteStatusText").text("");
}

function setIncompleteEmptyState(message, isError) {
	$("#incompleteTableWrap").hide();
	$("#incompleteEmptyState")
		.removeClass("is-loading is-error")
		.toggleClass("is-error", !!isError)
		.text(message);
}

function setIncompleteLastUpdated() {
	var now = new Date();
	$("#incompleteLastUpdated").text("Updated " + now.toLocaleTimeString());
}

function isLoopbackBatchStatus(statusCode) {
	return statusCode === "EXPORTED" || statusCode === "FTPED" || statusCode === "FAILED" || statusCode === "INCOMPLETE";
}

function isWorkflowBatchStatus(statusCode) {
	return statusCode === "FULFILL" || statusCode === "UNPR" || statusCode === "PEND" || statusCode === "EARNED";
}

function continueIncompleteBatch(row) {
	if (!row) {
		return;
	}
	if (row.fulfillmentMethod) {
		$("#fulfillmentMethod").val(row.fulfillmentMethod);
	}
	$("#paymentTypeGroup").val("All");
	if (row.statusCode === "FULFILL" || row.statusCode === "EARNED") {
		searchEarned();
	} else {
		searchUnprocessed();
	}
}

function appendIncompleteBatchRow(row) {
	var statusCode = row.statusCode || "";
	var btnName = null;
	var clickHandler = null;
	var showOrderInput = false;

	if (isLoopbackBatchStatus(statusCode)) {
		btnName = (row.fulfillmentMethod == "CHECK") ? "UPDATE CHECK#" : "UPDATE ORDER#";
		showOrderInput = row.fulfillmentMethod != "CHECK";
		clickHandler = function(e) {
			e.preventDefault();
			loopBack(row.batchId, row.fulfillmentMethod);
		};
	} else {
		btnName = "CONTINUE";
		clickHandler = function(e) {
			e.preventDefault();
			continueIncompleteBatch(row);
		};
	}

	var $tr = $("<tr></tr>");
	var amount = row.sumFulfillmentAmount == null ? 0 : row.sumFulfillmentAmount;

	$tr.append($("<td></td>").text(row.batchId));
	$tr.append($("<td></td>").text(row.businessLineDesc || ""));
	$tr.append($("<td></td>").html(row.businessLineFinanceCode));
	$tr.append($("<td></td>").addClass("col-num").text(Number(row.fulfillmentCount || 0).toLocaleString()));
	$tr.append($("<td></td>").addClass("col-num").text("$" + Number(amount).toLocaleString()));

	var $status = $("<span></span>").addClass("hon-status-badge").text(statusCode);
	$tr.append($("<td></td>").append($status));

	var $actionCell = $("<td></td>").addClass("hon-action-cell");
	if (btnName && clickHandler) {
		var $actionBtn = $("<a></a>")
			.addClass("btn btn-primary btn-sm hon-action-btn")
			.text(btnName)
			.attr("href", "#")
			.on("click", clickHandler);
		$actionCell.append($actionBtn);
	}

	if (showOrderInput) {
		$actionCell.append(
			$("<input>")
				.attr({ type: "text", id: "order_" + row.batchId, placeholder: "Order Number" })
				.addClass("form-control hon-order-input")
		);
	}

	$tr.append($actionCell);
	$("#incompleteResultsTableBody").append($tr);
}

// krr
function showHonorariaException(results) {
	if (!results || !results.exceptions || results.exceptions.length === 0) {
		showMessage("An unexpected error occurred. Please try again.");
		return;
	}
	var ex = results.exceptions[0];
	var msg = typeof ex === "string" ? ex : (ex.message || ex.detail || JSON.stringify(ex));
	showMessage(msg);
}

function suppressIncompletePanelForActiveBatches() {
	suppressIncompleteListUntilGenerate = true;
	$("#incompleteResultsTableBody").html("");
	setIncompleteEmptyState("No incomplete batches right now.");
	$("#incompleteStatusText").text("0 incomplete batch(es) found.");
	$("#incompleteTableWrap").hide();
	$("#incompleteResults").show();
}

function renderIncompleteResults(results) {
	var hasExported = null;
	var hasFailed = null;
	var continueRow = null;
	var displayableCount = 0;

	$("#incompleteResultsTableBody").html("");

	if (suppressIncompleteListUntilGenerate) {
		setIncompleteEmptyState("No incomplete batches right now.");
		$("#incompleteStatusText").text("0 incomplete batch(es) found.");
		$("#incompleteTableWrap").hide();
		$("#incompleteResults").show();
		enableSearchFilters();
		return;
	}

	if (!results || results.outHasRows <= 0 || !results.rows || results.rows.length === 0) {
		setIncompleteEmptyState("No incomplete batches right now.");
		$("#incompleteStatusText").text("0 incomplete batch(es) found.");
		enableSearchFilters();
		hideMessage();
		return;
	}

	$.each(results.rows, function(i, row) {
		var statusCode = row.statusCode || "";

		if (statusCode === "FAILED") {
			hasFailed = row;
		}
		if (statusCode === "EXPORTED" || statusCode === "FTPED" || statusCode === "FAILED") {
			hasExported = row;
		}
		if (isWorkflowBatchStatus(statusCode) && continueRow == null) {
			continueRow = row;
		}

		// Post-generate only (UPDATE CHECK# / loopback) — not EARNED/PEND rows still in Batches table
		if (isLoopbackBatchStatus(statusCode)) {
			appendIncompleteBatchRow(row);
			displayableCount++;
		}
	});

	$("#incompleteResults").show();
	if (displayableCount === 0) {
		$("#incompleteTableWrap").hide();
		setIncompleteEmptyState("No incomplete batches right now.");
		$("#incompleteStatusText").text("0 incomplete batch(es) found.");
	} else {
		$("#incompleteEmptyState").removeClass("is-loading is-error").text("");
		$("#incompleteTableWrap").show();
		$("#incompleteStatusText").text(displayableCount + " incomplete batch(es) loaded from live data.");
	}

	if (hasFailed != null) {
		showMessage("Batch " + hasFailed.batchId + " has failed. Please contact support or try again.");
	} else if (continueRow != null && hasExported == null && !suppressIncompleteListUntilGenerate) {
		$("#fulfillmentMethod").val(continueRow.fulfillmentMethod);
		$("#paymentTypeGroup").val("All");
		if (continueRow.statusCode === "FULFILL" || continueRow.statusCode === "EARNED") {
			searchEarned();
		} else {
			searchUnprocessed();
		}
		showMessage("Incomplete batch(es) exists. Please process them to enable searching for more.");
	} else if (displayableCount > 0 && hasExported != null) {
		hideMessage();
	}
}

function checkForIncompleteBatch() {
	setIncompleteLoadingState("Loading incomplete batches from Oracle...");
	
	$.getJSON('/IQVIATools/honoraria/check-for-incomplete-batch', {})
		.done(function(results) {
			console.log("checkForIncompleteBatch returned:");
			console.log(results);
			renderIncompleteResults(results);
			setIncompleteLastUpdated();
			if (typeof hideLoading === "function") {
				hideLoading();
			}
		})
		.fail(function(jqXHR, textStatus) {
			console.error("checkForIncompleteBatch failed:", textStatus, jqXHR);
			setIncompleteEmptyState("Could not load incomplete batches (" + textStatus + "). Click Refresh to try again.", true);
			$("#incompleteStatusText").text("Live update failed.");
			enableSearchFilters();
			if (typeof hideLoading === "function") {
				hideLoading();
			}
		});
}
	

function searchUnprocessed() {
	if (honorariaSearchInFlight) {
		return;
	}
	var fulfillmentMethod = $("#fulfillmentMethod").val();
	var paymentTypeGroup = $("#paymentTypeGroup").val();
	var dueDate = $("#dueDate").val();
	var errMsg = "";
	var totalFulfillments = 0;
	var totalAmount = 0;

	honorariaSearchInFlight = true;
	hideMessage();
	$("#searchResults").hide();
	$("#earnedResults").hide();	
	$(".optCol").hide();
	$("#searchResultsTableBody").html("");

	if (fulfillmentMethod == "")
		errMsg += "<li>Please select a payment type.";
	if (paymentTypeGroup == "")
		errMsg += "<li>Please select a program type.";
	
	if (errMsg == "") {
		suppressIncompleteListUntilGenerate = false;
		showLoading("Processing...");
		$.getJSON('/IQVIATools/honoraria/get-unprocessed-honoraria', {fulfillmentMethod, paymentTypeGroup, dueDate})
			.done(function (results) {
				hideLoading();
				honorariaSearchInFlight = false;
				console.log(`searchUnprocessed(${fulfillmentMethod}, ${paymentTypeGroup}, ${dueDate}) returned:`);	
				console.log(results);	

				if (results.exceptionCount != 0) {
					showMessage(results.exceptions[0]);
				} else {
					$.each(results.summaryRows, function(i, row) {
						$("#searchResultsTableBody").append(`<tr> 
							<td style="width:50px;">${row.businessLineDesc}</td> 
							<td style="width:50px;">${row.businessLineFinanceCode}</td> 
							<td style="text-align:right;">${row.totalFulfillments.toLocaleString()}</td> 
							<td style="text-align:right;">$${row.totalApprovedAmount.toLocaleString()}</td> 
							${renderCutoffCell(row.businessLineId, row.totalApprovedAmount)}
							<td><a onclick="fulfillOne(${row.businessLineId})" class="btn btn-primary" style="">FULFILL</a></td>
							</tr>`);
						totalFulfillments += row.totalFulfillments;
						totalAmount += row.totalApprovedAmount;
					});
					
					if (results.summaryRows.length > 1) {
						$("#searchResultsTableBody").append(`<tr> 
							<td colspan="2" style="text-align:right;">Total:</td> 
							<td style="text-align:right;">${totalFulfillments.toLocaleString()}</td> 
							<td style="text-align:right;">$${totalAmount.toLocaleString()}</td> 
							<td></td>
							<td><a id="fulfillAllBtn" onclick="fulfillAll()" class="btn btn-primary" style="display:none;">FULFILL ALL</a></td>
							</tr>`);
						
						if (totalAmount > 0) $("#fulfillAllBtn").show();
					}
					
					if (results.summaryRows.length > 0) $("#searchResults").show();				
				}
			})
			.fail(function(jqXHR, textStatus) {
				console.error("searchUnprocessed failed:", textStatus, jqXHR);
				honorariaSearchInFlight = false;
				if (typeof hideLoading === "function") {
					hideLoading();
				}
				showMessage("Search failed while loading unprocessed honoraria. Please try again.");
			});
	} else {
		honorariaSearchInFlight = false;
		showMessage(errMsg);
	}
}


function searchEarned() {
	if (honorariaSearchInFlight) {
		return;
	}
	var fulfillmentMethod = $("#fulfillmentMethod").val();
	var paymentTypeGroup = $("#paymentTypeGroup").val();
	var dueDate = $("#dueDate").val();
	var errMsg = "";
	var totalFulfillments = 0;
	var totalAmount = 0;
	var batchIds = [];

	honorariaSearchInFlight = true;
	if (!pendingRefreshUnprocessedAfterEarned) {
		$("#searchResults").hide();
	}
	$(".optCol").hide();
	$("#earnedResultsTableBody").html("");
	
	hideMessage();
	if (fulfillmentMethod == "")
		errMsg += "<li>Please select a payment type.";
	if (paymentTypeGroup == "")
		errMsg += "<li>Please select a program type.";
	
	if (errMsg == "") {	
		showLoading("Searching...");
		$.getJSON('/IQVIATools/honoraria/get-earned-honoraria', {fulfillmentMethod, paymentTypeGroup, dueDate})
			.done(function (results) {
				hideLoading();
				honorariaSearchInFlight = false;
				console.log(`searchEarned(${fulfillmentMethod}, ${paymentTypeGroup}, ${dueDate}) returned:`);	
				console.log(results);	

				if (results.exceptionCount != 0) {
					showMessage(results.exceptions[0]);
				} else {
					$.each(results.summaryRows, function(i, row) {
						$("#earnedResultsTableBody").append(`<tr> 
							<td style="width:20px;">${row.batchId}</td> 
							<td style="width:50px;">${row.businessLineDesc}</td> 
							<td style="width:50px;">${row.businessLineFinanceCode}</td> 
							<td style="text-align:right;">${row.totalFulfillments.toLocaleString()}</td> 
							<td style="text-align:right;">$${row.totalApprovedAmount.toLocaleString()}</td> 
							<td><a onclick="generateFile(${row.batchId})" class="btn btn-primary" style="">GENERATE</a></td>
							</tr>`);
						totalFulfillments += row.totalFulfillments;
						totalAmount += row.totalApprovedAmount;
						batchIds.push(row.batchId);
					});
					
					if (results.summaryRows.length > 1) {
						$("#earnedResultsTableBody").append(`<tr> 
							<td colspan="3" style="text-align:right;">Total:</td> 
							<td style="text-align:right;">${totalFulfillments.toLocaleString()}</td> 
							<td style="text-align:right;">$${totalAmount.toLocaleString()}</td> 
							<td><a id="generateAllBtn" onclick="generateFiles('${batchIds}')" class="btn btn-primary" style="display:none;">GENERATE ALL</a></td>
							</tr>`);
						
						if (totalAmount > 0) $("#generateAllBtn").show();
					}

					
					if (results.summaryRows.length > 0) $("#earnedResults").show();
				}
				if (pendingRefreshUnprocessedAfterEarned) {
					pendingRefreshUnprocessedAfterEarned = false;
					honorariaSearchInFlight = false;
					searchUnprocessed();
				}
			})
			.fail(function(jqXHR, textStatus) {
				console.error("searchEarned failed:", textStatus, jqXHR);
				pendingRefreshUnprocessedAfterEarned = false;
				honorariaSearchInFlight = false;
				if (typeof hideLoading === "function") {
					hideLoading();
				}
				showMessage("Search failed while loading earned honoraria. Please try again.");
			});
	} else {
		honorariaSearchInFlight = false;
		showMessage(errMsg);
	}
}


function renderCutoffCell(businessLineId, actualAmount) {
	return `<td class="hon-cutoff-cell">
		<div class="hon-cutoff-panel">
			<input type="text" class="form-control hon-cutoff-input"
				id="cutoff_${businessLineId}"
				data-business-line-id="${businessLineId}"
				data-actual-amount="${actualAmount}"
				inputmode="numeric"
				placeholder="Optional"
				autocomplete="off">
			<div class="hon-cutoff-error">
				<span class="hon-cutoff-error-icon">!</span>
				<span class="hon-cutoff-error-text">Enter a cutoff amount less than or equal to the actual amount.</span>
			</div>
		</div>
	</td>`;
}

function parseOptionalCutoff(val) {
	if (val === null || val === undefined || String(val).trim() === "") {
		return null;
	}
	var n = Number(val);
	return isNaN(n) ? null : n;
}

function validateCutoffInput($input) {
	var cutoff = parseOptionalCutoff($input.val());
	var actual = Number($input.data("actual-amount"));
	var $panel = $input.closest(".hon-cutoff-panel");
	var $err = $panel.find(".hon-cutoff-error");
	$input.removeClass("has-error");
	$err.removeClass("is-visible");
	if (cutoff === null) {
		return true;
	}
	if (cutoff > actual) {
		$input.addClass("has-error");
		$err.addClass("is-visible");
		return false;
	}
	return true;
}

function validateAllCutoffInputs(businessLineId) {
	var ok = true;
	$("#searchResultsTableBody .hon-cutoff-input").each(function() {
		var $input = $(this);
		if (businessLineId != null && Number($input.data("business-line-id")) !== Number(businessLineId)) {
			return;
		}
		if (!validateCutoffInput($input)) {
			ok = false;
		}
	});
	return ok;
}

function collectFulfillmentBatchArrays(businessLineId) {
	var businessLineIds = [];
	var batchCutoffAmounts = [];
	$("#searchResultsTableBody tr").each(function() {
		var $input = $(this).find(".hon-cutoff-input");
		if ($input.length === 0) {
			return;
		}
		var blId = Number($input.data("business-line-id"));
		if (businessLineId != null && blId !== Number(businessLineId)) {
			return;
		}
		businessLineIds.push(blId);
		var cutoff = parseOptionalCutoff($input.val());
		batchCutoffAmounts.push(cutoff === null ? "" : String(cutoff));
	});
	return { businessLineIds: businessLineIds, batchCutoffAmounts: batchCutoffAmounts };
}

function collectAllBusinessLineIdsFromFulfillmentTable() {
	var ids = [];
	$("#searchResultsTableBody .hon-cutoff-input").each(function() {
		ids.push(Number($(this).data("business-line-id")));
	});
	return ids;
}

function callGenerateFulfillmentBatches(req, onSuccess) {
	$.ajax({
		url: "/IQVIATools/honoraria/generate-fulfillment-batches",
		data: req,
		traditional: true,
		dataType: "json"
	}).done(onSuccess).fail(function(jqXHR, textStatus) {
		hideLoading();
		console.error("generate-fulfillment-batches failed:", textStatus, jqXHR);
		showMessage("Fulfill failed (" + textStatus + "). Please try again.");
	});
}

function hasAnyCutoffAmount(batchCutoffAmounts) {
	if (!batchCutoffAmounts || batchCutoffAmounts.length === 0) {
		return false;
	}
	for (var i = 0; i < batchCutoffAmounts.length; i++) {
		if (String(batchCutoffAmounts[i]).trim() !== "") {
			return true;
		}
	}
	return false;
}

// Sets passed in businness line's payments to PEND in the FULFILLMENT table.
function fulfillOne(businessLineId) {
	var fulfillmentMethod = $("#fulfillmentMethod").val();
	var paymentTypeGroup = $("#paymentTypeGroup").val();
	var dueDate = $("#dueDate").val();
	// fulfillmentMethod, paymentTypeGroup
	hideMessage();
	if (!validateAllCutoffInputs(businessLineId)) {
		return;
	}
	var collected = collectFulfillmentBatchArrays(businessLineId);
	var useBatchesWithCutoff = hasAnyCutoffAmount(collected.batchCutoffAmounts);
	var url = '/IQVIATools/honoraria/generate-fulfillment-batch';
	var req = {fulfillmentMethod, paymentTypeGroup, dueDate, businessLineId};
	if (useBatchesWithCutoff) {
		url = '/IQVIATools/honoraria/generate-fulfillment-batches';
		req = {
			fulfillmentMethod: fulfillmentMethod,
			paymentTypeGroup: paymentTypeGroup,
			dueDate: dueDate,
			businessLineIds: collected.businessLineIds,
			batchCutoffAmounts: collected.batchCutoffAmounts
		};
	}
	showLoading("Fulfilling...");
	var onDone = function (results) {
		hideLoading();
		console.log(`fulfillOne(${fulfillmentMethod}, ${paymentTypeGroup}, ${dueDate}, ${businessLineId}) returned:`);
		console.log(results);
		if (results.exceptionCount != 0) {
			showHonorariaException(results);
		} else {
			refreshAfterFulfillment();
		}
	};
	if (useBatchesWithCutoff) {
		callGenerateFulfillmentBatches(req, onDone);
	} else {
		$.getJSON(url, req, onDone).fail(function(jqXHR, textStatus) {
			hideLoading();
			showMessage("Fulfill failed (" + textStatus + "). Please try again.");
		});
	}
}


// Sets all businness line payments to PEND in the FULFILLMENT table.
function fulfillAll() {
	var fulfillmentMethod = $("#fulfillmentMethod").val();
	var paymentTypeGroup = $("#paymentTypeGroup").val();
	var dueDate = $("#dueDate").val();

	hideMessage();
	if (!validateAllCutoffInputs(null)) {
		return;
	}
	var collected = collectFulfillmentBatchArrays(null);
	var req = {fulfillmentMethod: fulfillmentMethod, paymentTypeGroup: paymentTypeGroup, dueDate: dueDate};
	if (hasAnyCutoffAmount(collected.batchCutoffAmounts)) {
		req.businessLineIds = collected.businessLineIds;
		req.batchCutoffAmounts = collected.batchCutoffAmounts;
	} else {
		req.businessLineIds = collectAllBusinessLineIdsFromFulfillmentTable();
	}

	showLoading("Fulfilling...");

	callGenerateFulfillmentBatches(req, function (results) {
		hideLoading();
		console.log(`fulfillAll(${fulfillmentMethod}, ${paymentTypeGroup}, ${dueDate}) returned:`);
		console.log(results);
		if (results.exceptionCount != 0) {
			showHonorariaException(results);
		} else {
			refreshAfterFulfillment();
		}
	});
}


function generateFile(batchId) {
	var dueDate = null;
	
	hideMessage();
	showLoading("Generating...");

	$.getJSON('/IQVIATools/honoraria/generate-file', {batchId: batchId, dueDate: dueDate}, function (results) {
		hideLoading();
		console.log(results);
		if (!results) {
			showMessage("There was a problem generating the file, batchId= " + batchId);
		} else {
			clearFulfillmentAndBatchPanelsAfterGenerate();
			checkForIncompleteBatch();
		}
	}).fail(function(jqXHR, textStatus) {
		hideLoading();
		showMessage("Generate failed (" + textStatus + "), batchId=" + batchId);
	});
}


function generateFiles(batchIds) {
	var dueDate = null;
	
	hideMessage();
	showLoading("Generating...");

	var ids = typeof batchIds === "string" ? batchIds.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : batchIds;
	$.ajax({
		url: "/IQVIATools/honoraria/generate-files",
		data: { batchIds: ids, dueDate: dueDate },
		traditional: true,
		dataType: "json"
	}).done(function (results) {
		hideLoading();
		console.log(results);
		if (!results) {
			showMessage("There was a problem generating the files, batchIds= " + batchIds);
		} else {
			clearFulfillmentAndBatchPanelsAfterGenerate();
			checkForIncompleteBatch();
		}
	}).fail(function(jqXHR, textStatus) {
		hideLoading();
		showMessage("Generate all failed (" + textStatus + ").");
	});
}

function loopBack(batchId, fulfillmentMethod) {
	var orderNum = "";
	if ($("#order_"+batchId).val()) orderNum = $("#order_"+batchId).val().trim();
	
	hideMessage();
	
	console.log("loopBack batchId="+batchId+", fulfillmentMethod="+fulfillmentMethod);
	if (orderNum != "") console.log("loopBack orderNum="+orderNum);
	
	if ((fulfillmentMethod == "AMAZON") && (orderNum == "")) {
		showMessage("Order number cannot be empty.");
		return;
	}
	
	showLoading("Processing...");
	$.getJSON('/IQVIATools/honoraria/run-loopback', {batchId:batchId, orderNumber:orderNum}, function (results) {
		hideLoading();
		console.log("loopBack returned: ");	
		console.log(results);	
		
		if (!results) {				
			showMessage("There was a problem processing batch " + batchId + ".");
		} else {
			checkForIncompleteBatch();
		}
	});	
	
}

function findChecksByNo() {
	var checkNo = $("#checkNo").val().trim();

	$("#voidNoResultMsg").html("").hide();
	$("#voidSearchResultsTableBody").html("");
	$(".optCol").hide();

	if (checkNo != "") {
		showLoading("Searching...");
		$.getJSON('/IQVIATools/honoraria/get-checks-by-number', {checkNo}, function (results) {
			console.log(results);	
			if (results.length == 0) {
				$("#voidNoResultMsg").html("No results").show();
				hideLoading();
			} else {		
				$("#voidResultsHeader").html("Results for check number: " + checkNo);
				$.each(results, function(i, check) {		
					var voidBtnDisp = (check.voidDatetime == null) ? voidBtn.replaceAll("~checkNo~",check.checkNo) : "";
					$("#voidSearchResultsTableBody").append(
						`<tr> 
							<td>${voidBtnDisp}</td>
							<td>${check.checkNo}</td>
							<td>$${check.denomination}</td>
							<td>${check.loadedDatetime}</td>
							<td>${nvl(check.voidDatetime)}</td>
							<td>${nvl(check.claimNo)}</td>
							<td>${nvl(check.remarks)}</td>
						</tr>`
					);
				});
				hideLoading();
				$("#voidSearchResults").show();
			}
		});	
	}
}


function findChecksByTrxid() {
	var trxid = $("#trxid").val().trim();

	$("#voidNoResultMsg").html("").hide();
	$("#voidSearchResultsTableBody").html("");
	$(".optCol").hide();

	if (trxid != "") {	
		showLoading("Searching...");
		$.getJSON('/IQVIATools/honoraria/get-checks-by-trxid', {trxid}, function (results) {
			console.log(results);	
			if (results.length == 0) {
				$("#voidNoResultMsg").html("No results").show();
				hideLoading();
			} else {		
				$("#voidResultsHeader").html(results.length + " Results for TargetRx Id: " + trxid);
				$.each(results, function(i, check) {
					var voidBtnDisp = (check[0].voidDatetime == null) ? voidBtn.replaceAll("~checkNo~",check[0].checkNo) : "";
					$("#voidSearchResultsTableBody").append(
						`<tr> 
							<td>${voidBtnDisp}</td>
							<td>${check[0].checkNo}</td>
							<td>$${check[0].denomination}</td>
							<td>${check[0].loadedDatetime}</td>
							<td>${nvl(check[0].voidDatetime)}</td>
							<td>${nvl(check[0].claimNo)}</td>
							<td>${nvl(check[0].remarks)}</td>
						</tr>`
					);
				});
				hideLoading();
				$("#voidSearchResults").show();
			}
		});	
	}
}


function findChecksByDates() {
	var fromDate = $("#fromDate").val().trim();
	var toDate = $("#toDate").val().trim();

	$("#voidNoResultMsg").html("").hide();
	$("#voidSearchResultsTableBody").html("");

	if ((fromDate != "") && (toDate != "")) {	
		showLoading("Searching...");
		$.getJSON('/IQVIATools/honoraria/get-checks-by-dates', {fromDate, toDate}, function (results) {
			console.log(results);	
			if (results.length == 0) {
				$("#voidNoResultMsg").html("No results").show();
				hideLoading();
			} else {		
				$("#voidResultsHeader").html(results.length + " Results for: " + fromDate + " - " + toDate);
				$(".optCol").show();
				$.each(results, function(i, check) {
					var voidBtnDisp = (check[0].voidDatetime == null) ? voidBtn.replaceAll("~checkNo~",check[0].checkNo) : "";
					$("#voidSearchResultsTableBody").append(
						`<tr> 
							<td>${voidBtnDisp}</td>
							<td>${check[0].checkNo}</td>
							<td>$${check[0].denomination}.00</td>
							<td>${check[0].loadedDatetime}</td>
							<td>${nvl(check[0].voidDatetime)}</td>
							<td>${nvl(check[0].claimNo)}</td>
							<td>${nvl(check[0].remarks)}</td>
							<td>${nvl(check[1].updatedUser)}</td>
							<td>${nvl(check[1])}</td>														
						</tr>`
					);
				});
				hideLoading();
				$("#voidSearchResults").show();
			}
		});	
	}

}


function initCheckTab() {
	$("#previousLoads").empty();	
	$("#dropzone_check_filename").val("");
	$("#checkNumbersDelim").val("");	

	showLoading("Searching...");
	$.getJSON('/IQVIATools/honoraria/get-stale-check-files', function (results) {
		console.log(results);	
		$("#previousLoads").append( new Option("Select a prior load",""));				
		$.each(results, function(i, check) {
			$("#previousLoads").append( new Option(check.fileId + " - " + check.insDate + " - " + check.insUser + " - " + check.inputFileName, check.fileId));				
		});
		$("#previousLoads").selectpicker('refresh');
		hideLoading();		
	});	
}

function getCheck(batchId) {
	var fileId = $("#previousLoads").val();
	var count = 0;
	$("#checksSearchResultsTableBody").html("");
	$("#checksResults").hide();
	$("#checksResultsHeader").html("");
       
	if (batchId != undefined) {
		fileId = batchId;
	}
	   
	showLoading("Searching...");
	$.getJSON('/IQVIATools/honoraria/get-stale-check-file-details', {fileId}, function (results) {
		console.log(results);	
		$.each(results, function(i, check) {
			if (check.personDetail != null) {
				count++;
				$("#checksSearchResultsTableBody").append(
					`<tr> 
						<td>${check.checkNumber}</td>
						<td>${check.checkDate}</td>
						<td>$${check.checkAmount}.00</td>
						<td>${check.checkPayeeName}</td>
						<td>${check.checkPayeeAddressLine1}</td>
						<td>${nvl(check.checkPayeeAddressLine2)}</td>
						<td>${nvl(check.checkPayeeAddressLine3)}</td>
						<td>${check.targetRxId}</td>
						<td>${check.personDetail.saleslogixUsername}</td>

						<td>${check.personDetail.firstName}</td>
						<td>${nvl(check.personDetail.middleInitial)}</td>
						<td>${check.personDetail.lastName}</td>

						<td>${check.personDetail.mailAddressLine1}</td>
						<td>${nvl(check.personDetail.mailAddressLine2)}</td>
						<td>${check.personDetail.mailCityName}</td>
						<td>${check.personDetail.mailStateCode}</td>
						<td>${check.personDetail.mailPostalCode}</td>

						<td>${nvl(check.reissueDate)}</td>
						<td>${nvl(check.reissueCheckNumber)}</td>
						<td>${nvl(check.reissueCheckDate)}</td>
						<td>${nvl(check.reissueCheckAmount)}</td>
					</tr>`
				);
			} else { // not in person_detail
				console.log("Person not found: checkNum:" + check.checkNumber + ", trxid=" + check.targetRxId);
			}
		});
		hideLoading();		
		
	$("#checksResultsHeader").html(`Results for batch: ${fileId}, ${count} Records found.`);
		$("#checksResults").show();
	});	
	
}



function exportToExcel(tableid, fileName){
	var htmls = "";
	var uri = 'data:application/vnd.ms-excel;base64,';
	var template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>{table}</table></body></html>'; 
	var base64 = function(s) {
		return window.btoa(unescape(encodeURIComponent(s)))
	};

	var format = function(s, c) {
		return s.replace(/{(\w+)}/g, function(m, p) {
			return c[p];
		})
	};

		var id = $('[id$="' + tableid + '"]'); 
		var strCopy = $('<div></div>').html(id.clone()).html(); 
		htmls = strCopy.replace("<br/>","\n");

	var ctx = {
		worksheet : 'Worksheet',
		table : htmls
	}

	var link = document.createElement("a");
	link.download = fileName + ".xls";
	template = template.replace("{worksheet}",fileName);
	link.href = uri + base64(format(template, ctx));
	link.click();
}


function initDropZone() {
	$("#uploadMsg").html("").hide();
	fileDropzone = new Dropzone('#checkFileToLoad', checkDropzoneOptions);

	fileDropzone.on("error", function(file, errorMsg) {		
		fileDropzone.removeFile(file);
		$("#uploadMsg").html(errorMsg).show();
	});
	
	fileDropzone.on("success", function(file) {
		uploadedFile = file.name;
		$("#dropzone_check_filename").val(file.name);
		//fileDropzone.removeFile(file);
	});

	fileDropzone.on("removedfile", function(file) {		
		$("#dropzone_check_filename").val("");
	});

}


function processCheckData() {
	$("#checkNumbersMsg").html("").hide();
	$("#uploadMsg").html("").hide();

	var checkNumbers = $("#checkNumbersDelim").val().trim();
	
	// validate
	if (checkNumbers == "") {
		$("#checkNumbersMsg").html("Please enter check numbers.").show();
	} else {
		var allCheckNumbers = checkNumbers.split(/,| |\r?\n/).filter(item => item.trim() !== "");
		$.each(allCheckNumbers, function(i, checkNo) {
			console.log(checkNo);
			if (isNaN(checkNo)) {
				$("#checkNumbersMsg").html("One of the check numbers is invalid.").show();
				return false;
			}
		});
		
		showLoading("Loading...");
		$.getJSON('/IQVIATools/honoraria/add-checks-by-number', {"allCheckNumbers":allCheckNumbers.toString()}, function (fileId) {
			console.log(fileId);	
			if (fileId != null) {
				initCheckTab();
				getCheck(fileId);
			}
			hideLoading();
		});
	

	}
}

function processCheckFile() {
	$("#checkNumbersMsg").html("").hide();
	$("#uploadMsg").html("").hide();

	var fileName = $("#dropzone_check_filename").val();
	if (fileName == "") {
		$("#uploadMsg").html("Please select a file to process.").show();
	} else {
		showLoading("Loading...");
		$.getJSON('/IQVIATools/honoraria/add-checks-by-file', {fileName}, function (fileId) {
			console.log(fileId);	
			hideLoading();
			if (fileId != null) {
				initCheckTab();
				getCheck(fileId);
				fileDropzone.removeAllFiles();
			}
		});
	}

}

function showMessage(msg) {
	$("#resultMsg").html(msg);
	$("#messageSec").show();
}

function hideMessage() {
	$("#resultMsg").html("");
	$("#messageSec").hide();
}

function disableSearchFilters() {
	$("#search-btn").addClass("disabled").css("pointer-events", "none").attr("aria-disabled", "true");
}

function enableSearchFilters() {
	$("#search-btn").removeClass("disabled").css("pointer-events", "").removeAttr("aria-disabled");
}

/** @deprecated use disableSearchFilters — kept for any legacy calls */
function disableSearch() {
	disableSearchFilters();
}

/** @deprecated use enableSearchFilters */
function enableSearch() {
	enableSearchFilters();
}

function refreshAfterFulfillment() {
	suppressIncompletePanelForActiveBatches();
	honorariaSearchInFlight = false;
	pendingRefreshUnprocessedAfterEarned = true;
	searchEarned();
}

function clearFulfillmentAndBatchPanelsAfterGenerate() {
	$("#searchResultsTableBody").html("");
	$("#searchResults").hide();
	$("#earnedResultsTableBody").html("");
	$("#earnedResults").hide();
	suppressIncompleteListUntilGenerate = false;
}


function nvl(str) {
	return (str==null) ? "" : str; 
}

// ==================== Report Tabs ====================

var summaryReportInitialized = false;
var monthlyReportInitialized = false;
var latencyReportInitialized = false;
var byCellProgramLookup = null;

function initSummaryReportTab() {
	if (summaryReportInitialized) return;
	summaryReportInitialized = true;
	$('#summaryStartDate, #summaryEndDate').datepicker({format: "mm/dd/yyyy"});
	$('#honSumReportProgram').off('change.honSummary').on('change.honSummary', function() {
		loadSummaryProgramEvents();
	});

	loadHonorariaSummaryPrograms();

	$.getJSON('/IQVIATools/honoraria/get-honoraria-disposition-codes', function(codes) {
		$.each(codes, function(i, code) {
			$('#summaryHonorariaStatus').append(new Option(code.shortName, code.codeName));
		});
	});
	$("#summaryExportBtn").click(function() {
		exportToExcel("summaryReportTable", "honorariaSummary");
	});
}

function loadHonorariaSummaryPrograms() {
	var $select = $('#honSumReportProgram');
	if (!$select.length) {
		return;
	}

	$select.empty().append(new Option('Loading programs...', ''));

	$.getJSON('/IQVIATools/list-management/findProgramsAction',
		{programId: 0, name: '', days: 14, statusCode: 'O', orderBy: 'eventId desc'},
		function(data) {
			$select.empty();
			if (data && data.length > 0) {
				$select.append(new Option('Select a program', 0));
				$.each(data, function(i, v) {
					var promoted = (v.lastPromotionType != null) ? ' - PROMOTED' : ' - AUTHORING';
					var label = v.eventId + ': ' + v.eventSpecifier + ' - ' + v.eventName + ' (' + v.eventLabel + ')' + promoted;
					$select.append(new Option(label, v.eventId));
				});
				if (data.length === 1) {
					$select.val(data[0].eventId);
				}
			} else {
				$select.append(new Option('No Programs Found', 0));
				$select.val(0);
			}
			if (typeof $.fn.selectpicker === 'function') {
				$select.selectpicker('refresh');
			}
		}
	).fail(function() {
		$select.empty().append(new Option('Could not load programs', 0));
		if (typeof $.fn.selectpicker === 'function') {
			$select.selectpicker('refresh');
		}
	});
}

function loadSummaryProgramEvents() {
	var programEventId = $('#honSumReportProgram').val();
	$('#summaryEventId').html('<option value="">ALL EVENTS</option>');
	if (!programEventId || programEventId == "0") return;
	$.getJSON('/IQVIATools/honoraria/get-program-events', {programEventId: programEventId}, function(events) {
		$.each(events, function(i, ev) {
			$('#summaryEventId').append(new Option(ev.eventLabel + ': ' + ev.eventName, ev.eventId));
		});
	});
}

function searchHonorariaSummary(sortBy) {
	var targetrxId = $('#summaryTargetrxId').val().trim();
	var approvedAmount = $('#summaryApprovedAmount').val().trim();
	var startDate = $('#summaryStartDate').val().trim();
	var endDate = $('#summaryEndDate').val().trim();
	var programEventId = $('#honSumReportProgram').val();
	var eventId = $('#summaryEventId').val();
	var honorariaStatus = $('#summaryHonorariaStatus').val();
	var manualOnly = $('#summaryManualOnly').is(':checked');

	if (targetrxId && isNaN(targetrxId)) {
		alert('TargetRx ID must be numeric.');
		return;
	}
	if (approvedAmount && isNaN(approvedAmount)) {
		alert('Honoraria Amount must be numeric.');
		return;
	}

	showLoading("Searching...");
	$.getJSON('/IQVIATools/honoraria/honoraria-summary-report', {
		targetrxId: targetrxId || null,
		approvedAmount: approvedAmount,
		startDate: startDate,
		endDate: endDate,
		programEventId: (programEventId && programEventId != "0") ? programEventId : null,
		eventId: eventId || null,
		honorariaStatus: honorariaStatus,
		manualOnly: manualOnly,
		sortBy: sortBy || ''
	}, function(result) {
		hideLoading();
		$('#summaryReportTableBody').html('');
		$.each(result.rows, function(i, row) {
			var earnedDate = row.earnedDatetime ? formatDateTime(row.earnedDatetime) : '';
			var fulfillStatus = row.fulfillmentStatus || '--';
			$('#summaryReportTableBody').append(`<tr>
				<td>${row.targetrxId}</td>
				<td>${row.lastName}, ${row.firstName}</td>
				<td>${row.programLabel}</td>
				<td>${row.eventLabel}</td>
				<td>${earnedDate}</td>
				<td>${formatCurrency(row.approvedAmount)}</td>
				<td>${row.honorariaStatus}</td>
				<td>${fulfillStatus}</td>
			</tr>`);
		});
		$('#summaryReportTotals').html('Total Honoraria: ' + result.totalCount +
			' &nbsp;&nbsp; Total Approved Amount: ' + formatCurrency(result.totalAmount));
		$('#summaryReportResults').show();
	});
}

function loadStatusSummaryReport() {
	showLoading("Loading...");
	$.getJSON('/IQVIATools/honoraria/status-summary-report', function(report) {
		hideLoading();
		var html = '';
		html += renderStatusGroupedSection('Approve Honoraria (Unprocessed)', report.unprocessedRows);
		html += renderStatusGroupedSection('Approve Honoraria (Processed)', report.approvedRows);
		html += renderFulfillSection(report.fulfillTotals);
		html += renderAmountSection('Approve Payment', report.approvePaymentRows);
		html += renderAmountSection('Assign Checks', report.assignChecksRows);
		html += renderSolomonSection(report.solomonRows);
		html += renderAmountSection('Approve Inventory', report.approveInventoryRows);
		html += renderAmountSection('Mail', report.mailRows);
		html += renderAmountSection('Printable', report.printableRows);
		html += renderAmountSection('Printed', report.printedRows);
		$('#statusSummaryContent').html(html);
	});
}

function renderStatusGroupedSection(title, rows) {
	var html = '<h4>' + title + '</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Program Label</th><th>Event Label</th><th>Honoraria Amount</th><th>Quantity</th><th>Amount Due</th></tr></thead><tbody>';
	var lastProgramId = -1;
	var subQty = 0, subTotal = 0, grandQty = 0, grandTotal = 0;
	var lastProgramLabel = '';
	$.each(rows, function(i, row) {
		if (lastProgramId != -1 && lastProgramId != row.programEventId) {
			html += renderProgramSubtotal(lastProgramLabel, subQty, subTotal);
			subQty = 0; subTotal = 0;
		}
		var progCell = (lastProgramId != row.programEventId) ? '<b>' + row.programLabel + '</b>' : '';
		var evtCell = (i == 0 || rows[i-1].eventId != row.eventId || lastProgramId != row.programEventId) ? '<b>' + row.eventLabel + '</b>' : '';
		html += '<tr><td>' + progCell + '</td><td>' + evtCell + '</td>' +
			'<td style="text-align:right;">' + formatCurrency(row.approvedAmount) + '</td>' +
			'<td style="text-align:right;">' + row.docs + '</td>' +
			'<td style="text-align:right;">' + formatCurrency(row.total) + '</td></tr>';
		lastProgramId = row.programEventId;
		lastProgramLabel = row.programLabel;
		subQty += row.docs;
		subTotal += parseFloat(row.total);
		grandQty += row.docs;
		grandTotal += parseFloat(row.total);
	});
	if (rows.length > 0) {
		html += renderProgramSubtotal(lastProgramLabel, subQty, subTotal);
	}
	html += '<tr><td colspan="3" style="text-align:right;"><b>Totals:</b></td>' +
		'<td style="text-align:right;"><b>' + grandQty + '</b></td>' +
		'<td style="text-align:right;"><b>' + formatCurrency(grandTotal) + '</b></td></tr></tbody></table><br/>';
	return html;
}

function renderProgramSubtotal(label, qty, total) {
	return '<tr><td colspan="3" style="text-align:right;">Totals for ' + label + '</td>' +
		'<td style="text-align:right;"><b>' + qty + '</b></td>' +
		'<td style="text-align:right;"><b>' + formatCurrency(total) + '</b></td></tr>';
}

function renderFulfillSection(totals) {
	return '<h4>Fulfill</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Total Docs</th><th>Total Honoraria</th><th>Total Due</th></tr></thead><tbody><tr>' +
		'<td style="text-align:center;">' + totals.totalDocs + '</td>' +
		'<td style="text-align:center;">' + totals.totalHonoraria + '</td>' +
		'<td style="text-align:center;">' + formatCurrency(totals.totalAmount) + '</td></tr></tbody></table><br/>';
}

function renderAmountSection(title, rows) {
	var qty = 0, total = 0;
	var html = '<h4>' + title + '</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Fulfillment Amount</th><th>Quantity</th><th>Total Amount</th></tr></thead><tbody>';
	$.each(rows, function(i, row) {
		html += '<tr><td style="text-align:right;">' + formatCurrency(row.amount) + '</td>' +
			'<td style="text-align:right;">' + row.quantity + '</td>' +
			'<td style="text-align:right;">' + formatCurrency(row.total) + '</td></tr>';
		qty += row.quantity;
		total += parseFloat(row.total);
	});
	html += '<tr><td style="text-align:right;"><b>Totals:</b></td>' +
		'<td style="text-align:right;">' + qty + '</td>' +
		'<td style="text-align:right;">' + formatCurrency(total) + '</td></tr></tbody></table><br/>';
	return html;
}

function renderSolomonSection(rows) {
	var html = '<h4>Solomon Check Creation</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Batch ID</th><th>Fulfillment Amount</th><th>Quantity</th><th>Total Amount</th></tr></thead><tbody>';
	var lastBatch = -1, subQty = 0, subTotal = 0, grandQty = 0, grandTotal = 0;
	$.each(rows, function(i, row) {
		if (lastBatch != -1 && lastBatch != row.batchId) {
			html += '<tr><td colspan="2" style="text-align:right;">Totals for Batch ' + lastBatch + '</td>' +
				'<td style="text-align:right;"><b>' + subQty + '</b></td>' +
				'<td style="text-align:right;"><b>' + formatCurrency(subTotal) + '</b></td></tr>';
			subQty = 0; subTotal = 0;
		}
		var batchCell = (lastBatch != row.batchId) ? row.batchId : '';
		html += '<tr><td style="text-align:right;">' + batchCell + '</td>' +
			'<td style="text-align:right;">' + formatCurrency(row.amount) + '</td>' +
			'<td style="text-align:right;">' + row.quantity + '</td>' +
			'<td style="text-align:right;">' + formatCurrency(row.total) + '</td></tr>';
		lastBatch = row.batchId;
		subQty += row.quantity;
		subTotal += parseFloat(row.total);
		grandQty += row.quantity;
		grandTotal += parseFloat(row.total);
	});
	if (rows.length > 0) {
		html += '<tr><td colspan="2" style="text-align:right;">Totals for Batch ' + lastBatch + '</td>' +
			'<td style="text-align:right;"><b>' + subQty + '</b></td>' +
			'<td style="text-align:right;"><b>' + formatCurrency(subTotal) + '</b></td></tr>';
	}
	html += '<tr><td colspan="2" style="text-align:right;"><b>Totals:</b></td>' +
		'<td style="text-align:right;">' + grandQty + '</td>' +
		'<td style="text-align:right;">' + formatCurrency(grandTotal) + '</td></tr></tbody></table><br/>';
	return html;
}

function initMonthlyReportTab() {
	if (monthlyReportInitialized) return;
	monthlyReportInitialized = true;
	$('#monthlyStartDate, #monthlyEndDate').datepicker({format: "mm/dd/yyyy"});
	renderDateRangeLinks('monthlyWeekLinks', 'monthlyMonthLinks', 'monthly', true);
}

function initLatencyReportTab() {
	if (latencyReportInitialized) return;
	latencyReportInitialized = true;
	$('#latencyStartDate, #latencyEndDate').datepicker({format: "mm/dd/yyyy"});
	renderDateRangeLinks('latencyWeekLinks', 'latencyMonthLinks', 'latency', false);
}

function renderDateRangeLinks(weekContainerId, monthContainerId, prefix, weekStartsFriday) {
	var weekHtml = '', monthHtml = '';
	for (var w = 0; w < 5; w++) {
		var range = getWeekRange(w, weekStartsFriday);
		weekHtml += '<div><a href="javascript:void(0)" onclick="setReportDateRange(\'' + prefix + '\',\'' +
			range.start + '\',\'' + range.end + '\')">View ' + range.label + ' (' + range.display + ')</a></div>';
	}
	for (var m = 0; m < 5; m++) {
		var monthRange = getMonthRange(m);
		monthHtml += '<div><a href="javascript:void(0)" onclick="setReportDateRange(\'' + prefix + '\',\'' +
			monthRange.start + '\',\'' + monthRange.end + '\')">View ' + monthRange.label + ' (' + monthRange.display + ')</a></div>';
	}
	$('#' + weekContainerId).html(weekHtml);
	$('#' + monthContainerId).html(monthHtml);
}

function setReportDateRange(prefix, start, end) {
	if (prefix === 'monthly') {
		$('#monthlyStartDate').val(start);
		$('#monthlyEndDate').val(end);
		compileMonthlyReport();
	} else {
		$('#latencyStartDate').val(start);
		$('#latencyEndDate').val(end);
		compileLatencyReport();
	}
}

function getWeekRange(weeksAgo, startsFriday) {
	var d = new Date();
	var day = d.getDay();
	var targetDay = startsFriday ? 5 : 1;
	var diff = (day + 7 - targetDay) % 7;
	var start = new Date(d);
	start.setDate(d.getDate() - diff - (weeksAgo * 7));
	var end = new Date(start);
	end.setDate(start.getDate() + 6);
	return {
		start: formatDate(start),
		end: formatDate(end),
		label: weeksAgo === 0 ? 'Current Week' : (weeksAgo === 1 ? 'Last Week' : weeksAgo + ' Weeks Ago'),
		display: formatDayDate(start) + ' - ' + formatDayDate(end)
	};
}

function getMonthRange(monthsAgo) {
	var start = new Date();
	start.setDate(1);
	start.setMonth(start.getMonth() - monthsAgo);
	var end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
	return {
		start: formatDate(start),
		end: formatDate(end),
		label: monthsAgo === 0 ? 'Current Month' : (monthsAgo === 1 ? 'Last Month' : monthsAgo + ' Months Ago'),
		display: formatDayDate(start) + ' - ' + formatDayDate(end)
	};
}

function compileMonthlyReport() {
	var startDate = $('#monthlyStartDate').val().trim();
	var endDate = $('#monthlyEndDate').val().trim();
	if (!startDate || !endDate) {
		alert('Start Date and End Date are required.');
		return;
	}
	showLoading("Compiling...");
	$.getJSON('/IQVIATools/honoraria/monthly-honoraria-report', {startDate, endDate}, function(report) {
		hideLoading();
		var html = '';
		html += renderMonthlyProjectSection('Earned Honoraria from ' + startDate + ' to ' + endDate, report.earnedRows);
		html += renderMonthlyProjectSection('Earned and Paid Honoraria from ' + startDate + ' to ' + endDate, report.earnedAndPaidRows);
		html += renderMonthlyProjectSection('Earned and Unpaid Honoraria from ' + startDate + ' to ' + endDate, report.earnedAndUnpaidRows);
		html += renderMonthlyOtherPaidSection('Other Paid Projects from ' + startDate + ' to ' + endDate, report.otherPaidRows);
		html += renderMonthlyCheckSection('Other Paid Non-Projects from ' + startDate + ' to ' + endDate, report.otherCheckRows);
		$('#monthlyReportContent').html(html);
	});
}

function renderMonthlyProjectSection(title, rows) {
	var docs = 0, amount = 0;
	var html = '<h4>' + title + '</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Project</th><th>Quantity</th><th>Amount</th><th>Average</th></tr></thead><tbody>';
	$.each(rows, function(i, row) {
		html += '<tr><td>' + row.project + '</td><td style="text-align:right;">' + row.totalDocs +
			'</td><td style="text-align:right;">' + formatCurrency(row.totalAmount) +
			'</td><td style="text-align:right;">' + formatCurrency(row.average) + '</td></tr>';
		docs += row.totalDocs;
		amount += parseFloat(row.totalAmount);
	});
	var avg = docs > 0 ? amount / docs : 0;
	html += '<tr><td><b>Sub-Total</b></td><td style="text-align:right;">' + docs +
		'</td><td style="text-align:right;">' + formatCurrency(amount) +
		'</td><td style="text-align:right;">' + formatCurrency(avg) + '</td></tr></tbody></table><br/>';
	return html;
}

function renderMonthlyOtherPaidSection(title, rows) {
	var docs = 0, amount = 0;
	var html = '<h4>' + title + '</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Project</th><th>Earned</th><th>Quantity</th><th>Amount</th><th>Average</th></tr></thead><tbody>';
	$.each(rows, function(i, row) {
		html += '<tr><td>' + row.project + '</td><td>' + row.monthEarned +
			'</td><td style="text-align:right;">' + row.totalDocs +
			'</td><td style="text-align:right;">' + formatCurrency(row.totalAmount) +
			'</td><td style="text-align:right;">' + formatCurrency(row.average) + '</td></tr>';
		docs += row.totalDocs;
		amount += parseFloat(row.totalAmount);
	});
	var avg = docs > 0 ? amount / docs : 0;
	html += '<tr><td colspan="2"><b>Sub-Total</b></td><td style="text-align:right;">' + docs +
		'</td><td style="text-align:right;">' + formatCurrency(amount) +
		'</td><td style="text-align:right;">' + formatCurrency(avg) + '</td></tr></tbody></table><br/>';
	return html;
}

function renderMonthlyCheckSection(title, rows) {
	var qty = 0, amount = 0;
	var html = '<h4>' + title + '</h4><table class="table table-bordered"><thead class="thead-dark"><tr>' +
		'<th>Check Type</th><th>Status</th><th>Remarks</th><th>Denomination</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>';
	$.each(rows, function(i, row) {
		html += '<tr><td>' + nvl(row.checkType) + '</td><td>' + nvl(row.statusCode) + '</td><td>' + nvl(row.remarks) +
			'</td><td style="text-align:right;">' + formatCurrency(row.denomination) +
			'</td><td style="text-align:right;">' + row.quantity +
			'</td><td style="text-align:right;">' + formatCurrency(row.amount) + '</td></tr>';
		qty += row.quantity;
		amount += parseFloat(row.amount);
	});
	html += '<tr><td colspan="4"><b>Sub-Total</b></td><td style="text-align:right;">' + qty +
		'</td><td style="text-align:right;">' + formatCurrency(amount) + '</td></tr></tbody></table><br/>';
	return html;
}

function initByCellTab() {
	$('#honProgReportProgram').off('change.honSummary').on('change.honSummary', function() {
		loadByCellCellSelectors();
	});

	searchOpenPrograms(0,"","14","eventId desc","honProgReportProgram");
}

function lookupByCellProgram() {
	var pid = $('#honProgReportProgram').val().trim();
	if (!pid) return;
	$.getJSON('/IQVIATools/list-management/findProgramsAction',
		{programId: pid, name: '', days: 0, statusCode: 'O', orderBy: 'eventId desc'},
		function(data) {
			if (data && data.length > 0) {
				byCellProgramLookup = data[0];
				$('#byCellProgramLabel').text(data[0].eventLabel + ': ' + data[0].eventName);
			} else {
				byCellProgramLookup = null;
				$('#byCellProgramLabel').text('Program not found.');
			}
		});
}


function loadByCellCellSelectors() {
	var programIds = [];
	$('#honProgReportProgram option:selected').each(function () {
		programIds.push($(this).val());
	});

	if (programIds.length === 0) {
		$('#byCellConfigRow').hide();
		$('#byCellCellSelectors').html('');
		return;
	}
	$.getJSON('/IQVIATools/honoraria/cells-by-programs', {programEventIds: programIds.join(',')}, function(cells) {
		console.log(cells);
		var html = '';
		$.each(cells, function(i, cellNo) {
			html += '<label>Cell ' + cellNo + ': </label>' +
				'<select class="byCellCellSelect" data-cell="' + cellNo + '">' +
				'<option value="' + cellNo + '">USE</option><option value="-1">IGNORE</option></select><br/>';
		});
		$('#byCellCellSelectors').html(html);
		$('#byCellConfigRow').show();
	});
}


function compileByCellReport() {
	var programIds = [];
	$('#honProgReportProgram option:selected').each(function () {
		programIds.push($(this).val());
	});
		
	var cells = [];
	$('.byCellCellSelect').each(function() {
		var val = $(this).val();
		if (val != '-1') cells.push(val);
	});
	if (programIds.length === 0) {
		alert('Please add at least one program.');
		return;
	}
	if (cells.length === 0) {
		alert('You must use at least one cell in this report.');
		return;
	}
	showLoading("Compiling...");
	$.getJSON('/IQVIATools/honoraria/honoraria-by-cell-report',
		{programEventIds: programIds.join(','), cells: cells.join(',')},
		function(report) {
			hideLoading();
			$('#byCellReportTableBody').html('');
			$.each(report.rows, function(i, row) {
				$('#byCellReportTableBody').append(`<tr>
					<td>${row.eventLabel}</td>
					<td>${row.cellSig}</td>
					<td>${row.docs}</td>
					<td>${formatCurrency(row.manualHonoraria)}</td>
					<td>${formatCurrency(row.regularHonoraria)}</td>
					<td>${formatCurrency(row.totalHonoraria)}</td>
				</tr>`);
			});
			$('#byCellReportTableFoot').html(`<tr class="thead-dark">
				<th colspan="2">Totals</th>
				<th>${report.docTotal}</th>
				<th>${formatCurrency(report.totalManualHonoraria)}</th>
				<th>${formatCurrency(report.totalRegularHonoraria)}</th>
				<th>${formatCurrency(report.totalHonoraria)}</th>
			</tr>`);
			$('#byCellResults').show();
		});
}

function compileLatencyReport() {
	var startDate = $('#latencyStartDate').val().trim();
	var endDate = $('#latencyEndDate').val().trim();
	if (!startDate || !endDate) {
		alert('Start Date and End Date are required.');
		return;
	}
	showLoading("Compiling...");
	$.getJSON('/IQVIATools/honoraria/honoraria-latency-report', {startDate, endDate}, function(report) {
		hideLoading();
		var html = '';
		html += '<h4>Honoraria Latency from ' + startDate + ' to ' + endDate + ' (Based on Paid Date)</h4>';
		html += '<table class="table table-bordered"><thead class="thead-dark"><tr><th>Latency (days)</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>';
		$.each(report.latencyRows, function(i, row) {
			var label = (row.latency == null) ? 'Total' : row.latency;
			html += '<tr><td>' + label + '</td><td style="text-align:right;">' + row.total +
				'</td><td style="text-align:right;">' + formatCurrency(row.totalHon) + '</td></tr>';
		});
		html += '</tbody></table><br/>';
		html += '<h4>Reissues from ' + startDate + ' to ' + endDate + '</h4>';
		html += '<table class="table table-bordered"><tbody><tr><td>Reissues</td><td style="text-align:right;">' +
			report.reissues.quantity + '</td><td style="text-align:right;">' + formatCurrency(report.reissues.totalHon) + '</td></tr></tbody></table><br/>';
		html += '<h4>Manual Honoraria from ' + startDate + ' to ' + endDate + ' (Based on Paid Date)</h4>';
		html += '<table class="table table-bordered"><tbody><tr><td style="text-align:right;">' + report.manualPaid.total +
			'</td><td style="text-align:right;">' + formatCurrency(report.manualPaid.totalHon) + '</td></tr></tbody></table><br/>';
		html += '<h4>Earned and Unpaid Honoraria from ' + startDate + ' to ' + endDate + '</h4>';
		html += '<table class="table table-bordered"><thead class="thead-dark"><tr><th>Age</th><th>Quantity</th><th>Amount</th><th>Average</th></tr></thead><tbody>';
		$.each(report.unpaidAgeRows, function(i, row) {
			html += '<tr><td style="text-align:right;">' + row.age + '</td><td style="text-align:right;">' + row.totalDocs +
				'</td><td style="text-align:right;">' + formatCurrency(row.totalAmount) +
				'</td><td style="text-align:right;">' + formatCurrency(row.average) + '</td></tr>';
		});
		html += '</tbody></table>';
		$('#latencyReportContent').html(html);
	});
}

function formatCurrency(val) {
	if (val == null || val === '') return '$0.00';
	var num = parseFloat(val);
	if (isNaN(num)) return '$0.00';
	return '$' + num.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatDate(d) {
	return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear();
}

function formatDayDate(d) {
	var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	return days[d.getDay()] + ' ' + (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();
}

function formatDateTime(val) {
	if (!val) return '';
	var d = new Date(val);
	return formatDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function pad2(n) {
	return (n < 10 ? '0' : '') + n;
}