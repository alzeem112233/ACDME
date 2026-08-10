package com.quzeschool.academy;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QzPrint")
public class QzPrintPlugin extends Plugin {
  private WebView printWebView;

  @PluginMethod
  public void printHtml(PluginCall call) {
    String html = call.getString("html");
    String jobName = call.getString("jobName", "QZ Academy Report");

    if (html == null || html.trim().isEmpty()) {
      call.reject("HTML report is empty");
      return;
    }

    if (getActivity() == null) {
      call.reject("Android activity is not available");
      return;
    }

    getActivity().runOnUiThread(() -> {
      try {
        printWebView = new WebView(getContext());
        printWebView.setWebViewClient(new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            try {
              PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
              if (printManager == null) {
                call.reject("Android print service is not available");
                return;
              }

              PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
              PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();

              printManager.print(jobName, adapter, attributes);
              call.resolve();
            } catch (Exception error) {
              call.reject("Unable to open Android print dialog", error);
            }
          }
        });
        printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
      } catch (Exception error) {
        call.reject("Unable to prepare report for printing", error);
      }
    });
  }
}
